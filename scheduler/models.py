from pydantic import BaseModel
from typing import Any, Optional


class BlockedSlot(BaseModel):
    day: str
    timeslot_id: str
    reason: str  # 'blackout' | 'booking'


class RoomPayload(BaseModel):
    id: str
    room_type: str
    capacity: int
    building: str
    available_days: list[str]
    features: list[str] = []
    blocked_slots: list[BlockedSlot] = []


class FacultyPayload(BaseModel):
    id: str
    max_classes_per_day: int
    max_classes_per_week: int
    consecutive_class_limit: int = 2
    not_available_timeslots: list[str] = []


class SessionDurationRule(BaseModel):
    session_durations: list[int]


class SubjectPayload(BaseModel):
    id: str
    subject_type: str          # 'Theory' | 'Lab' | 'Elective'
    classes_per_week: int
    preferred_room_type: Optional[str] = None
    required_room_features: list[str] = []
    fixed_timeslot_id: Optional[str] = None
    fixed_day: Optional[str] = None
    session_durations: list[int] = []


class BatchPayload(BaseModel):
    id: str
    student_strength: int
    max_weekly_classes: Optional[int] = None


class AssignmentPayload(BaseModel):
    """Links a subject to a batch and faculty for this scheduling run."""
    subject_id: str
    batch_id: str
    faculty_id: str


class ParallelGroup(BaseModel):
    subject_id: str
    batch_ids: list[str]


class TimeslotPayload(BaseModel):
    id: str
    shift: str
    is_break: bool = False
    is_lab_block_start: bool = False
    lab_block_partner_id: Optional[str] = None
    duration_hours: float = 1.0


class SolveRequest(BaseModel):
    job_id: str
    correlation_id: str
    term_id: str
    department_id: str
    rooms: list[RoomPayload]
    faculty: list[FacultyPayload]
    subjects: list[SubjectPayload]
    batches: list[BatchPayload]
    assignments: list[AssignmentPayload]
    timeslots: list[TimeslotPayload]
    parallel_groups: list[ParallelGroup] = []
    soft_weights: dict[str, int] = {}
    timeout_seconds: int = 30
    num_solutions: int = 3


class TimetableEntry(BaseModel):
    batch_id: str
    subject_id: str
    faculty_id: str
    room_id: str
    timeslot_id: str
    day: str
    is_lab_block: bool = False


class SolutionOption(BaseModel):
    seed: int
    conflict_score: int
    quality_pct: float
    utilization_rate: float
    entries: list[TimetableEntry]


class InfeasibilityDetail(BaseModel):
    constraint: str
    description: str


class SolveResponse(BaseModel):
    job_id: str
    correlation_id: str
    status: str  # 'success' | 'infeasible' | 'timeout'
    options: list[SolutionOption] = []
    infeasibility_report: Optional[list[InfeasibilityDetail]] = None
