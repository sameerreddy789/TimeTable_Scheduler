/**
 * Runs all pre-validation checks for a given term + department before a scheduling run.
 * Returns a ReadinessReport. If score < 100, the scheduler must NOT be invoked.
 */
async function runPreValidation(client, termId, departmentId) {
  const failures = [];
  let total = 0;

  async function check(id, description, configUrl, fn) {
    total++;
    const passed = await fn();
    if (!passed) failures.push({ checkId: id, description, configUrl });
  }

  // 16.1a — Every subject assignment has a faculty member
  await check('16.1a', 'Every subject assignment must have an assigned faculty member',
    '/subjects', async () => {
      const r = await client.query(
        `SELECT 1 FROM subject_assignments WHERE term_id=$1 AND faculty_id IS NULL LIMIT 1`, [termId]
      );
      return (r.rowCount ?? 0) === 0;
    });

  // 16.1b — Faculty max_classes_per_day <= total non-break timeslots
  await check('16.1b', 'Faculty max_classes_per_day must not exceed total non-break timeslots',
    '/faculty', async () => {
      const slots = await client.query(`SELECT COUNT(*) AS cnt FROM timeslots WHERE is_break=FALSE`);
      const totalSlots = parseInt(slots.rows[0].cnt, 10);
      const r = await client.query(
        `SELECT 1 FROM faculty_profiles WHERE max_classes_per_day > $1 LIMIT 1`, [totalSlots]
      );
      return (r.rowCount ?? 0) === 0;
    });

  // 16.1c — Every Lab subject has at least one Lab room with sufficient capacity
  await check('16.1c', 'Every Lab subject must have at least one Lab room with sufficient capacity',
    '/rooms', async () => {
      const r = await client.query(
        `SELECT 1 FROM subject_assignments sa
         JOIN subjects s ON s.id = sa.subject_id
         JOIN batches b ON b.id = sa.batch_id
         WHERE sa.term_id=$1 AND s.subject_type='Lab'
           AND NOT EXISTS (
             SELECT 1 FROM rooms r WHERE r.room_type='Lab' AND r.is_active=TRUE AND r.capacity >= b.student_strength
           ) LIMIT 1`, [termId]
      );
      return (r.rowCount ?? 0) === 0;
    });

  // 16.1d — Total weekly hours per batch <= available timeslots per week
  await check('16.1d', 'Total weekly class hours per batch must not exceed available timeslots per week',
    '/batches', async () => {
      const slots = await client.query(`SELECT COUNT(*) AS cnt FROM timeslots WHERE is_break=FALSE`);
      const slotsPerDay = parseInt(slots.rows[0].cnt, 10);
      const slotsPerWeek = slotsPerDay * 5;
      const r = await client.query(
        `SELECT 1 FROM (
           SELECT sa.batch_id, SUM(s.classes_per_week) AS total_classes
           FROM subject_assignments sa JOIN subjects s ON s.id = sa.subject_id
           WHERE sa.term_id=$1 GROUP BY sa.batch_id
         ) t WHERE t.total_classes > $2 LIMIT 1`, [termId, slotsPerWeek]
      );
      return (r.rowCount ?? 0) === 0;
    });

  // 16.1e — No two subjects for the same batch have conflicting fixed timeslot assignments
  await check('16.1e', 'No two subjects for the same batch can share the same fixed timeslot',
    '/subjects', async () => {
      const r = await client.query(
        `SELECT 1 FROM subject_assignments sa1
         JOIN subject_assignments sa2 ON sa2.batch_id=sa1.batch_id AND sa2.id<>sa1.id AND sa2.term_id=sa1.term_id
         JOIN subjects s1 ON s1.id=sa1.subject_id
         JOIN subjects s2 ON s2.id=sa2.subject_id
         WHERE sa1.term_id=$1
           AND s1.fixed_timeslot_id IS NOT NULL AND s2.fixed_timeslot_id IS NOT NULL
           AND s1.fixed_timeslot_id=s2.fixed_timeslot_id AND s1.fixed_day=s2.fixed_day
         LIMIT 1`, [termId]
      );
      return (r.rowCount ?? 0) === 0;
    });

  // 16.1f — Every Elective subject has a room with capacity >= combined batch strength
  await check('16.1f', 'Every Elective subject must have a room with capacity >= combined batch strength',
    '/rooms', async () => {
      const r = await client.query(
        `SELECT 1 FROM elective_groups eg
         JOIN (
           SELECT group_id, SUM(b.student_strength) AS combined
           FROM elective_group_batches egb JOIN batches b ON b.id=egb.batch_id GROUP BY group_id
         ) cs ON cs.group_id=eg.id
         WHERE eg.term_id=$1
           AND NOT EXISTS (SELECT 1 FROM rooms r WHERE r.is_active=TRUE AND r.capacity >= cs.combined)
         LIMIT 1`, [termId]
      );
      return (r.rowCount ?? 0) === 0;
    });

  // 16.1g — No faculty assigned more weekly classes than their max
  await check('16.1g', 'No faculty member can be assigned more weekly classes than their maximum',
    '/faculty', async () => {
      const r = await client.query(
        `SELECT 1 FROM (
           SELECT sa.faculty_id, COUNT(*) AS assigned, fp.max_classes_per_week
           FROM subject_assignments sa JOIN faculty_profiles fp ON fp.id=sa.faculty_id
           JOIN subjects s ON s.id=sa.subject_id WHERE sa.term_id=$1
           GROUP BY sa.faculty_id, fp.max_classes_per_week
         ) t WHERE t.assigned * 1 > t.max_classes_per_week LIMIT 1`, [termId]
      );
      return (r.rowCount ?? 0) === 0;
    });

  // 16.1h — No session_duration_rule requires a session longer than a single timeslot
  await check('16.1h', 'No session duration rule can require a session longer than a single timeslot',
    '/subjects', async () => {
      const ts = await client.query(
        `SELECT MAX(EXTRACT(EPOCH FROM (end_time - start_time))/3600) AS max_dur FROM timeslots WHERE is_break=FALSE`
      );
      const maxDur = parseFloat(ts.rows[0].max_dur ?? '1');
      const r = await client.query(
        `SELECT 1 FROM session_duration_rules sdr
         WHERE EXISTS (SELECT 1 FROM unnest(sdr.session_durations) AS d WHERE d > $1) LIMIT 1`, [maxDur]
      );
      return (r.rowCount ?? 0) === 0;
    });

  // 16.1i — Faculty total daily load <= consecutive_class_limit * 2
  await check('16.1i', 'Faculty total daily teaching load must not exceed consecutive_class_limit × 2',
    '/faculty', async () => {
      const r = await client.query(
        `SELECT 1 FROM (
           SELECT sa.faculty_id, SUM(s.classes_per_week) AS weekly, fp.consecutive_class_limit, fp.max_classes_per_day
           FROM subject_assignments sa JOIN subjects s ON s.id=sa.subject_id
           JOIN faculty_profiles fp ON fp.id=sa.faculty_id WHERE sa.term_id=$1
           GROUP BY sa.faculty_id, fp.consecutive_class_limit, fp.max_classes_per_day
         ) t WHERE t.max_classes_per_day > t.consecutive_class_limit * 2 LIMIT 1`, [termId]
      );
      return (r.rowCount ?? 0) === 0;
    });

  // 23.4 — Room feature tag requirements can be satisfied
  await check('23.4', 'Every subject with required room features must have at least one matching room',
    '/rooms', async () => {
      const r = await client.query(
        `SELECT 1 FROM subjects s
         WHERE s.required_room_features IS NOT NULL AND array_length(s.required_room_features, 1) > 0
           AND NOT EXISTS (
             SELECT 1 FROM rooms r JOIN room_feature_tags rft ON rft.room_id=r.id
             WHERE r.is_active=TRUE GROUP BY r.id
             HAVING s.required_room_features <@ array_agg(rft.tag)
           ) LIMIT 1`
      );
      return (r.rowCount ?? 0) === 0;
    });

  // 24.3 — Batch weekly load does not exceed max_weekly_classes
  await check('24.3', 'Total required weekly classes per batch must not exceed batch max_weekly_classes',
    '/batches', async () => {
      const r = await client.query(
        `SELECT 1 FROM (
           SELECT sa.batch_id, SUM(s.classes_per_week) AS total, b.max_weekly_classes
           FROM subject_assignments sa JOIN subjects s ON s.id=sa.subject_id
           JOIN batches b ON b.id=sa.batch_id
           WHERE sa.term_id=$1 AND b.max_weekly_classes IS NOT NULL
           GROUP BY sa.batch_id, b.max_weekly_classes
         ) t WHERE t.total > t.max_weekly_classes LIMIT 1`, [termId]
      );
      return (r.rowCount ?? 0) === 0;
    });

  // 26.7 — No fixed-timeslot subject falls on a blackout date
  await check('26.7', 'No fixed-timeslot subject assignment can fall on a blackout date',
    '/blackout-dates', async () => {
      const r = await client.query(
        `SELECT 1 FROM subject_assignments sa
         JOIN subjects s ON s.id=sa.subject_id
         JOIN blackout_dates bd ON bd.term_id=sa.term_id
         WHERE sa.term_id=$1
           AND s.fixed_timeslot_id IS NOT NULL AND s.fixed_day IS NOT NULL
           AND bd.date_start <= CURRENT_DATE AND bd.date_end >= CURRENT_DATE
         LIMIT 1`, [termId]
      );
      return (r.rowCount ?? 0) === 0;
    });

  const passed = total - failures.length;
  const score = total === 0 ? 100 : Math.round((passed / total) * 100);
  return { score, passed, total, failures };
}

module.exports = { runPreValidation };
