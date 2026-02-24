"""
CP-SAT solver for the Smart Timetable Management System.
Implements all hard constraints from Req 7.3 a–j and soft constraint objective.
"""
from ortools.sat.python import cp_model
from models import (
    SolveRequest, SolutionOption, TimetableEntry, InfeasibilityDetail
)

DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']


def solve_timetable(request: SolveRequest, seed: int) -> SolutionOption | None:
    """
    Run CP-SAT with a given random seed. Returns a SolutionOption or None if infeasible.
    """
    model = cp_model.CpModel()

    # Index lookups
    timeslot_ids = [ts.id for ts in request.timeslots if not ts.is_break]
    room_ids = [r.id for r in request.rooms]
    faculty_map = {f.id: f for f in request.faculty}
    room_map = {r.id: r for r in request.rooms}
    timeslot_map = {ts.id: ts for ts in request.timeslots}
    subject_map = {s.id: s for s in request.subjects}
    batch_map = {b.id: b for b in request.batches}

    # Build blocked slot set: (room_id, day, timeslot_id)
    blocked: set[tuple[str, str, str]] = set()
    for room in request.rooms:
        for bs in room.blocked_slots:
            blocked.add((room.id, bs.day, bs.timeslot_id))

    # Decision variables: x[assignment_idx][day][timeslot_id][room_id] = BoolVar
    # For each (subject, batch, faculty) assignment, for each (day, timeslot, room) combo
    x: dict[tuple[int, str, str, str], cp_model.IntVar] = {}

    for idx, asgn in enumerate(request.assignments):
        subj = subject_map[asgn.subject_id]
        batch = batch_map[asgn.batch_id]

        for day in DAYS:
            for ts_id in timeslot_ids:
                ts = timeslot_map[ts_id]
                if ts.is_break:
                    continue
                for room_id in room_ids:
                    room = room_map[room_id]
                    # Skip blocked slots
                    if (room_id, day, ts_id) in blocked:
                        continue
                    # Hard: Lab subjects only in Lab rooms
                    if subj.subject_type == 'Lab' and room.room_type != 'Lab':
                        continue
                    # Hard: room capacity >= batch strength
                    if room.capacity < batch.student_strength:
                        continue
                    # Hard: room must have required features
                    if subj.required_room_features:
                        if not all(f in room.features for f in subj.required_room_features):
                            continue
                    # Hard: fixed timeslot enforcement
                    if subj.fixed_timeslot_id and subj.fixed_day:
                        if ts_id != subj.fixed_timeslot_id or day != subj.fixed_day:
                            continue

                    var = model.new_bool_var(f'x_{idx}_{day}_{ts_id}_{room_id}')
                    x[(idx, day, ts_id, room_id)] = var

    # Hard: classes_per_week count per assignment
    for idx, asgn in enumerate(request.assignments):
        subj = subject_map[asgn.subject_id]
        all_vars = [v for (i, d, t, r), v in x.items() if i == idx]
        model.add(sum(all_vars) == subj.classes_per_week)

    # Hard: no room clash — at most one class per (room, day, timeslot)
    for day in DAYS:
        for ts_id in timeslot_ids:
            for room_id in room_ids:
                vars_here = [v for (i, d, t, r), v in x.items()
                             if d == day and t == ts_id and r == room_id]
                if vars_here:
                    model.add(sum(vars_here) <= 1)

    # Hard: no faculty clash — at most one class per (faculty, day, timeslot)
    faculty_assignments: dict[str, list[int]] = {}
    for idx, asgn in enumerate(request.assignments):
        faculty_assignments.setdefault(asgn.faculty_id, []).append(idx)

    for fac_id, idxs in faculty_assignments.items():
        for day in DAYS:
            for ts_id in timeslot_ids:
                vars_here = [v for (i, d, t, r), v in x.items()
                             if i in idxs and d == day and t == ts_id]
                if vars_here:
                    model.add(sum(vars_here) <= 1)

    # Hard: faculty max_classes_per_day
    for fac_id, idxs in faculty_assignments.items():
        fac = faculty_map[fac_id]
        for day in DAYS:
            vars_day = [v for (i, d, t, r), v in x.items() if i in idxs and d == day]
            if vars_day:
                model.add(sum(vars_day) <= fac.max_classes_per_day)

    # Hard: batch max_weekly_classes
    batch_assignments: dict[str, list[int]] = {}
    for idx, asgn in enumerate(request.assignments):
        batch_assignments.setdefault(asgn.batch_id, []).append(idx)

    for batch_id, idxs in batch_assignments.items():
        batch = batch_map[batch_id]
        if batch.max_weekly_classes:
            all_vars = [v for (i, d, t, r), v in x.items() if i in idxs]
            model.add(sum(all_vars) <= batch.max_weekly_classes)

    # Hard: parallel section synchronization — same timeslot + day for all batches in group
    for pg in request.parallel_groups:
        pg_idxs = [i for i, a in enumerate(request.assignments)
                   if a.subject_id == pg.subject_id and a.batch_id in pg.batch_ids]
        if len(pg_idxs) < 2:
            continue
        for day in DAYS:
            for ts_id in timeslot_ids:
                # If first batch is assigned here, all must be assigned here (same day+slot)
                first_vars = [v for (i, d, t, r), v in x.items()
                              if i == pg_idxs[0] and d == day and t == ts_id]
                for other_idx in pg_idxs[1:]:
                    other_vars = [v for (i, d, t, r), v in x.items()
                                  if i == other_idx and d == day and t == ts_id]
                    if first_vars and other_vars:
                        model.add(sum(first_vars) == sum(other_vars))

    # Soft constraints — minimize weighted penalty
    weights = request.soft_weights
    penalty_terms = []

    # Soft 7.4a: minimize gaps in batch daily schedule
    gap_weight = weights.get('gap_minimization', 3)
    for batch_id, idxs in batch_assignments.items():
        for day in DAYS:
            day_slots = sorted(
                set(ts_id for (i, d, t, r) in x if i in idxs and d == day),
                key=lambda ts: timeslot_ids.index(ts) if ts in timeslot_ids else 0
            )
            for j in range(len(day_slots) - 1):
                ts1_pos = timeslot_ids.index(day_slots[j]) if day_slots[j] in timeslot_ids else 0
                ts2_pos = timeslot_ids.index(day_slots[j + 1]) if day_slots[j + 1] in timeslot_ids else 0
                gap = ts2_pos - ts1_pos - 1
                if gap > 0:
                    gap_var = model.new_int_var(0, gap, f'gap_{batch_id}_{day}_{j}')
                    penalty_terms.append(gap_var * gap_weight)

    # Soft 7.4f: consecutive class limit violations
    consec_weight = weights.get('consecutive_limit', 4)
    for fac_id, idxs in faculty_assignments.items():
        fac = faculty_map[fac_id]
        for day in DAYS:
            for start_pos in range(len(timeslot_ids) - fac.consecutive_class_limit):
                window = timeslot_ids[start_pos:start_pos + fac.consecutive_class_limit + 1]
                window_vars = [v for (i, d, t, r), v in x.items()
                               if i in idxs and d == day and t in window]
                if len(window_vars) > fac.consecutive_class_limit:
                    overflow = model.new_bool_var(f'consec_{fac_id}_{day}_{start_pos}')
                    model.add(sum(window_vars) > fac.consecutive_class_limit).only_enforce_if(overflow)
                    penalty_terms.append(overflow * consec_weight)

    if penalty_terms:
        model.minimize(sum(penalty_terms))

    # Solve
    solver = cp_model.CpSolver()
    solver.parameters.random_seed = seed
    solver.parameters.max_time_in_seconds = request.timeout_seconds / max(request.num_solutions, 1)
    solver.parameters.num_workers = 1

    status = solver.solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return None

    # Extract solution
    entries: list[TimetableEntry] = []
    for (idx, day, ts_id, room_id), var in x.items():
        if solver.value(var) == 1:
            asgn = request.assignments[idx]
            ts = timeslot_map[ts_id]
            entries.append(TimetableEntry(
                batch_id=asgn.batch_id,
                subject_id=asgn.subject_id,
                faculty_id=asgn.faculty_id,
                room_id=room_id,
                timeslot_id=ts_id,
                day=day,
                is_lab_block=ts.is_lab_block_start,
            ))

    conflict_score = int(solver.objective_value) if penalty_terms else 0

    # Compute max possible score for normalization
    max_possible = sum(
        (len(timeslot_ids) * len(DAYS)) * w
        for w in [gap_weight, consec_weight]
    ) or 1
    quality_pct = round(100 - (conflict_score / max_possible) * 100, 2)
    quality_pct = max(0.0, min(100.0, quality_pct))

    # Utilization rate: assigned slots / total available slots
    total_available = len(room_ids) * len(timeslot_ids) * len(DAYS)
    utilization_rate = round(len(entries) / total_available, 4) if total_available > 0 else 0.0

    return SolutionOption(
        seed=seed,
        conflict_score=conflict_score,
        quality_pct=quality_pct,
        utilization_rate=utilization_rate,
        entries=entries,
    )


def generate_infeasibility_report(request: SolveRequest) -> list[InfeasibilityDetail]:
    """Quick checks to explain why no feasible solution exists."""
    issues: list[InfeasibilityDetail] = []

    subject_map = {s.id: s for s in request.subjects}
    batch_map = {b.id: b for b in request.batches}
    room_map = {r.id: r for r in request.rooms}

    for asgn in request.assignments:
        subj = subject_map[asgn.subject_id]
        batch = batch_map[asgn.batch_id]

        # Check if any room can accommodate this assignment
        eligible_rooms = [
            r for r in request.rooms
            if r.capacity >= batch.student_strength
            and (subj.subject_type != 'Lab' or r.room_type == 'Lab')
            and all(f in r.features for f in subj.required_room_features)
        ]
        if not eligible_rooms:
            issues.append(InfeasibilityDetail(
                constraint='room_availability',
                description=f'No eligible room for subject {subj.id} / batch {batch.id}'
            ))

    return issues
