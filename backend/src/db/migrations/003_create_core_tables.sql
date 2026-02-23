-- Departments
CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL
);

-- Academic Terms
CREATE TABLE academic_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT UNIQUE NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT FALSE
);

-- Users & Auth
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Super_Admin','Department_Admin','Faculty','Authority')),
  department_id UUID REFERENCES departments(id),
  is_active BOOLEAN DEFAULT TRUE,
  failed_login_count INT DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rooms
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_number TEXT NOT NULL,
  room_type TEXT NOT NULL CHECK (room_type IN ('Classroom','Lab','Seminar_Hall')),
  capacity INT NOT NULL CHECK (capacity > 0),
  building TEXT NOT NULL,
  available_days TEXT[] NOT NULL,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE room_feature_tags (
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (room_id, tag)
);

-- Timeslots
CREATE TABLE timeslots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  shift TEXT NOT NULL CHECK (shift IN ('Morning','Evening')),
  is_break BOOLEAN DEFAULT FALSE,
  is_lab_block_start BOOLEAN DEFAULT FALSE,
  lab_block_partner_id UUID REFERENCES timeslots(id)
);

-- Batches
CREATE TABLE batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id),
  academic_year TEXT NOT NULL,
  section_label TEXT NOT NULL,
  student_strength INT NOT NULL CHECK (student_strength > 0),
  max_weekly_classes INT,
  UNIQUE (department_id, academic_year, section_label)
);

-- Faculty
CREATE TABLE faculty_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  full_name TEXT NOT NULL,
  primary_department_id UUID NOT NULL REFERENCES departments(id),
  max_classes_per_day INT NOT NULL,
  max_classes_per_week INT NOT NULL,
  avg_leave_days_per_month NUMERIC(4,1),
  consecutive_class_limit INT NOT NULL DEFAULT 2
);

CREATE TABLE faculty_secondary_depts (
  faculty_id UUID REFERENCES faculty_profiles(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id),
  workload_pct NUMERIC(5,2) NOT NULL,
  PRIMARY KEY (faculty_id, department_id)
);

CREATE TABLE faculty_timeslot_prefs (
  faculty_id UUID REFERENCES faculty_profiles(id) ON DELETE CASCADE,
  timeslot_id UUID REFERENCES timeslots(id),
  pref_type TEXT NOT NULL CHECK (pref_type IN ('preferred','not_available')),
  PRIMARY KEY (faculty_id, timeslot_id, pref_type)
);

-- Faculty Leaves
CREATE TABLE faculty_leaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id UUID NOT NULL REFERENCES faculty_profiles(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id),
  date_start DATE NOT NULL,
  date_end DATE NOT NULL,
  leave_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Approved',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subjects
CREATE TABLE subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('Theory','Lab','Elective')),
  weekly_hours INT NOT NULL,
  classes_per_week INT NOT NULL,
  preferred_room_type TEXT CHECK (preferred_room_type IN ('Classroom','Lab','Seminar_Hall')),
  required_room_features TEXT[],
  fixed_timeslot_id UUID REFERENCES timeslots(id),
  fixed_day TEXT
);

CREATE TABLE session_duration_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  session_durations INT[] NOT NULL
);

-- Subject Assignments
CREATE TABLE subject_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id UUID NOT NULL REFERENCES academic_terms(id),
  subject_id UUID NOT NULL REFERENCES subjects(id),
  batch_id UUID NOT NULL REFERENCES batches(id),
  faculty_id UUID NOT NULL REFERENCES faculty_profiles(id),
  UNIQUE (term_id, subject_id, batch_id)
);

-- Parallel Sections
CREATE TABLE parallel_section_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id UUID NOT NULL REFERENCES academic_terms(id),
  subject_id UUID NOT NULL REFERENCES subjects(id)
);

CREATE TABLE parallel_section_members (
  group_id UUID REFERENCES parallel_section_groups(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES batches(id),
  PRIMARY KEY (group_id, batch_id)
);

-- Elective Groups
CREATE TABLE elective_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id UUID NOT NULL REFERENCES academic_terms(id),
  subject_id UUID NOT NULL REFERENCES subjects(id)
);

CREATE TABLE elective_group_batches (
  group_id UUID REFERENCES elective_groups(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES batches(id),
  PRIMARY KEY (group_id, batch_id)
);

-- Timetable Versions
CREATE TABLE timetable_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id UUID NOT NULL REFERENCES academic_terms(id),
  department_id UUID NOT NULL REFERENCES departments(id),
  version_label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Draft','Pending_Approval','Published','Rejected')),
  conflict_score INT,
  quality_pct NUMERIC(5,2),
  utilization_rate NUMERIC(5,2),
  rejection_reason TEXT,
  submitted_by UUID REFERENCES users(id),
  reviewed_by UUID REFERENCES users(id),
  version_number INT NOT NULL DEFAULT 1,
  public_token UUID,
  public_token_type TEXT CHECK (public_token_type IN ('permanent','short_lived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (term_id, department_id, version_label)
);

-- Timetable Entries
CREATE TABLE timetable_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timetable_version_id UUID NOT NULL REFERENCES timetable_versions(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES batches(id),
  subject_id UUID NOT NULL REFERENCES subjects(id),
  faculty_id UUID NOT NULL REFERENCES faculty_profiles(id),
  room_id UUID NOT NULL REFERENCES rooms(id),
  timeslot_id UUID NOT NULL REFERENCES timeslots(id),
  day TEXT NOT NULL,
  is_lab_block BOOLEAN DEFAULT FALSE,
  version_number INT NOT NULL DEFAULT 1
);

-- Room Bookings
CREATE TABLE room_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id),
  booked_by UUID NOT NULL REFERENCES users(id),
  booking_date DATE NOT NULL,
  timeslot_id UUID NOT NULL REFERENCES timeslots(id),
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Blackout Dates
CREATE TABLE blackout_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id UUID NOT NULL REFERENCES academic_terms(id),
  date_start DATE NOT NULL,
  date_end DATE NOT NULL,
  label TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('institution','department')),
  department_id UUID REFERENCES departments(id)
);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notification_preferences (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  email_enabled BOOLEAN DEFAULT TRUE,
  PRIMARY KEY (user_id, notification_type)
);

-- Audit Log
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Soft Constraint Weights
CREATE TABLE soft_constraint_weights (
  term_id UUID REFERENCES academic_terms(id),
  constraint_key TEXT NOT NULL,
  weight INT NOT NULL CHECK (weight BETWEEN 1 AND 10),
  PRIMARY KEY (term_id, constraint_key)
);

-- Public API Keys
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash TEXT UNIQUE NOT NULL,
  label TEXT,
  data_access_consent BOOLEAN DEFAULT FALSE,
  rate_limit_per_min INT DEFAULT 100,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Wizard Progress
CREATE TABLE wizard_progress (
  user_id UUID REFERENCES users(id),
  term_id UUID REFERENCES academic_terms(id),
  current_step INT NOT NULL DEFAULT 1,
  completed_steps INT[] DEFAULT '{}',
  PRIMARY KEY (user_id, term_id)
);

-- Scheduling Jobs
CREATE TABLE scheduling_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id UUID NOT NULL REFERENCES academic_terms(id),
  department_id UUID NOT NULL REFERENCES departments(id),
  status TEXT NOT NULL CHECK (status IN ('pending','running','completed','failed','applied')),
  correlation_id UUID NOT NULL,
  solution_pool JSONB,
  selected_option_index INT,
  error_detail JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
