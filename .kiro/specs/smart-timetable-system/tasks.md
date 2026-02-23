# Tasks: Smart Timetable Management System

## Phase 1: Project Scaffolding & Infrastructure

- [x] 1.1 Initialize monorepo structure with `frontend/` (React + Vite + TypeScript) and `backend/` (Node.js + Express + TypeScript) and `scheduler/` (Python) directories
- [x] 1.2 Configure PostgreSQL database with UTF-8 encoding and `und-x-icu` collation; run initial schema migrations for all tables defined in the Data Models section
- [x] 1.3 Set up Redis instance; configure BullMQ scheduling queue with `concurrency: os.cpus().length` worker cap and dead-letter queue (`scheduling:dlq`)
- [x] 1.4 Configure Vite PWA plugin with service worker template; set up i18next with `en` and `te` locale files under `src/locales/`
- [x] 1.5 Set up Prometheus metrics endpoint, Sentry error reporting, and structured `pino` logging with correlation ID middleware in the Express app
- [x] 1.6 Write database seed script for development (departments, rooms, timeslots, users)

## Phase 2: Authentication & RBAC

- [-] 2.1 Implement JWT issuance (HS256, 8-hour expiry, HttpOnly + SameSite=Strict cookie) and token invalidation via Redis denylist
- [ ] 2.2 Implement RBAC middleware with permission matrix for all four roles (Super_Admin, Department_Admin, Faculty, Authority)
- [ ] 2.3 Implement rate limiting (5 failed attempts / IP / 15 min; account lock after 10 consecutive failures via Redis)
- [ ] 2.4 Implement audit log post-handler middleware writing to `audit_logs` on every mutating request
- [ ] 2.5 Implement user management endpoints (create, update, deactivate, role assignment) — Super_Admin only
- [ ] 2.6 Write property test: for any valid credential pair, JWT decode yields correct user ID, role, and ~8h expiry (Property 1)
- [ ] 2.7 Write property test: for any invalid credential pair, response is HTTP 401 and body does not reveal which field was wrong (Property 2)
- [ ] 2.8 Write property test: for any user role, accessing an out-of-scope endpoint returns HTTP 403 (Property 3)
- [ ] 2.9 Write property test: for any mutating operation, exactly one audit_log row is created with correct fields (Property 4)

## Phase 3: Core Entity CRUD

- [ ] 3.1 Implement Room CRUD endpoints with validation (capacity > 0, at least one available day/timeslot); include room feature tag management
- [ ] 3.2 Implement Department and Batch CRUD; enforce uniqueness constraint on (department_id, academic_year, section_label)
- [ ] 3.3 Implement Timeslot CRUD with lab block grouping; prevent deletion if active timetable assignments reference the timeslot
- [ ] 3.4 Implement Subject CRUD with Session_Duration_Rule validation (weekly_hours = classes_per_week × session_duration); Lab type warning
- [ ] 3.5 Implement Faculty Profile CRUD with secondary department workload allocation, timeslot preferences, and consecutive class limit
- [ ] 3.6 Implement Subject Assignment CRUD (term + subject + batch + faculty linkage)
- [ ] 3.7 Implement Parallel Section Group and Elective Group management endpoints
- [ ] 3.8 Implement Blackout Date CRUD with institution/department scope
- [ ] 3.9 Write property test: room with capacity ≤ 0 is rejected (Property 5)
- [ ] 3.10 Write property test: duplicate batch (dept, year, section) is rejected (Property 6)
- [ ] 3.11 Write property test: subject with weekly_hours ≠ classes_per_week × session_duration is rejected (Property 7)

## Phase 4: Pre-Validation Engine

- [ ] 4.1 Implement all 9 pre-validation check categories (Req 16.1 a–i) plus room feature tag check (Req 23.4), batch weekly load check (Req 24.3), and fixed-slot-on-blackout check (Req 26.7)
- [ ] 4.2 Implement `ReadinessReport` response with score, passed/total counts, per-failure `configUrl` deep links
- [ ] 4.3 Expose `POST /schedule/validate` endpoint that runs pre-validation and returns the report
- [ ] 4.4 Write property test: for any scheduling request where at least one pre-validation check fails, the system returns HTTP 422 and does not enqueue a job (Property 13)

## Phase 5: Python Scheduling Microservice

- [ ] 5.1 Implement `/solve` POST endpoint accepting the full job payload (rooms with blocked_slots, faculty, subjects, batches, timeslots, soft_weights, timeout_seconds)
- [ ] 5.2 Implement CP-SAT model with all hard constraints (Req 7.3 a–j) and soft constraint objective function
- [ ] 5.3 Implement solution pool generation: run solver 3–5 times with different `random_seed` values; return `options[]` array with `conflict_score`, `quality_pct`, `utilization_rate`, and `entries[]` per option
- [ ] 5.4 Implement infeasibility report generation when no feasible solution exists
- [ ] 5.5 Implement `/health` GET liveness probe
- [ ] 5.6 Write property test: for any successful scheduling run, all generated options satisfy all hard constraint invariants simultaneously (no room clash, no faculty clash, capacity sufficiency, weekly count correctness, parallel section sync, batch weekly load, lab room enforcement, blackout exclusion) (Property 8)

## Phase 6: Scheduling Job Queue & Two-Phase Write

- [ ] 6.1 Implement `POST /schedule/run` endpoint: run pre-validation, enqueue BullMQ job with full payload and correlation_id, return 202 + job_id
- [ ] 6.2 Implement BullMQ worker: dequeue job, call Python `/solve`, write `solution_pool JSONB` to `scheduling_jobs` table (staging phase), push WebSocket event to Department Admin
- [ ] 6.3 Implement `POST /schedule/{job_id}/apply` endpoint: read selected option from `solution_pool`, promote entries to `timetable_versions` + `timetable_entries` using a single batch INSERT statement inside a Postgres transaction (promotion phase)
- [ ] 6.4 Implement DLQ monitor worker: on job failure after 3 retries, send WebSocket + email notification to Department Admin
- [ ] 6.5 Propagate `X-Correlation-ID` header from Express → BullMQ job payload → Python service → all log entries
- [ ] 6.6 Write property test: for any failed or cancelled scheduling run, no timetable_entries rows exist in the DB (Property 14)
- [ ] 6.7 Write property test: for any scheduling run, no timetable_entries rows exist until the Department Admin explicitly applies an option (solution pool staging invariant)
- [ ] 6.8 Write property test: for any conflict_score and max_possible_score, quality_pct = 100 − (conflict_score / max_possible_score) × 100 (conflict score normalization invariant)

## Phase 7: Timetable View & Management

- [ ] 7.1 Implement timetable grid view (filterable by department, year, section; mobile-friendly; days as rows, timeslots as columns)
- [ ] 7.2 Implement Drag-Drop Editor: `POST /timetable/{id}/move` with hard constraint re-validation on drop; return `409 Conflict` with `ConflictDetail` + `SwapSuggestion[]` on violation
- [ ] 7.3 Implement timetable approval workflow: submit for approval (→ Pending_Approval), Authority approve (→ Published, locked), Authority reject (→ Rejected + reason + notification)
- [ ] 7.4 Implement optimistic locking: version number check on every save; return conflict warning with conflicting user info on mismatch
- [ ] 7.5 Implement real-time "user X is editing" indicator via Socket.io pub/sub
- [ ] 7.6 Implement semester rollover: copy published timetable as draft for new term; run pre-validation on copy and flag stale assignments
- [ ] 7.7 Implement PDF export (grid layout + metadata) and Excel + iCalendar (.ics) export
- [ ] 7.8 Implement side-by-side comparison view for generated options (Conflict_Score, Utilization_Rate, faculty load, gap periods)
- [ ] 7.9 Write property test: for any drag-drop move, the API response includes a complete hard constraint validation result (Property 9)
- [ ] 7.10 Write property test: for any two concurrent edits with the same version number, exactly one succeeds and the DB version increments by exactly 1 (Property 15)

## Phase 8: Elective Handling & Analytics

- [ ] 8.1 Implement elective group management: associate elective subject with multiple batches; compute combined student strength
- [ ] 8.2 Enforce elective room capacity (>= combined strength) and faculty/room clash constraints across all associated batches in the scheduler
- [ ] 8.3 Display elective sessions in timetable view of every associated batch
- [ ] 8.4 Implement Analytics Dashboard: room utilization %, faculty load distribution, top-3 congested days, free periods per day; scope to department for Department_Admin
- [ ] 8.5 Write property test: for any elective group, combined strength = sum of all batch strengths, and assigned room capacity >= combined strength (Property 10)

## Phase 9: Supporting Features

- [ ] 9.1 Implement Excel Importer (SheetJS) for rooms, faculty, subjects, batches; atomic transaction with rollback on any error; return per-row error report
- [ ] 9.2 Implement downloadable Excel template files for each importable entity type
- [ ] 9.3 Implement Dynamic Rescheduling: on faculty leave, identify affected classes, suggest ranked replacements (expertise → daily load → substitution count → availability), apply swap and audit log
- [ ] 9.4 Implement Free Room Detection: `GET /rooms/available?date=&start=&end=` returning free rooms with type/capacity/building; room booking creation with audit log; utilization heatmap view
- [ ] 9.5 Implement Notification Service: in-app (Socket.io + `notifications` table) and email (BullMQ + Nodemailer) with per-user preferences and 90-day retention
- [ ] 9.6 Implement Shareable Public Timetable Links: generate UUID public tokens per batch/faculty timetable; QR code display; revoke/regenerate; optional short-lived 24h token mode
- [ ] 9.7 Implement Guided Setup Wizard (8 steps) with server-side step status checks and `wizard_progress` persistence; step 7 triggers pre-validation
- [ ] 9.8 Write property test: for any Excel file with at least one invalid row, DB state is unchanged after the import attempt (Property 11)
- [ ] 9.9 Write property test: for any faculty leave, suggested replacements are ordered by expertise match → daily load → substitution count, and all candidates are available without exceeding max classes/day (Property 12)

## Phase 10: Public API & Security

- [ ] 10.1 Implement Public API router at `/api/v1/public` with API key authentication, Redis sliding-window rate limiting (100 req/min/key), and DPDP anonymization
- [ ] 10.2 Implement all four public endpoints: GET timetable by batch, GET timetable by faculty, GET available rooms, GET faculty leave dates
- [ ] 10.3 Implement API key management (create, activate/deactivate, set `data_access_consent` flag) — Super_Admin only
- [ ] 10.4 Expose OpenAPI documentation at `/api/docs`
- [ ] 10.5 Enforce HTTPS redirect, CSRF token validation on all state-changing requests, and input sanitization (SQL injection / XSS prevention) across all endpoints

## Phase 11: PWA & i18n

- [ ] 11.1 Implement service worker caching for current-week timetable JSON; store `version_hash` (SHA-256) or `Last-Modified` in cached response header
- [ ] 11.2 Implement background sync on reconnect (`?since={last_sync_ts}`); compare cached vs server version hash; display "Timetable Updated — Refresh Needed" banner when server version is newer
- [ ] 11.3 Implement offline indicator banner (`navigator.onLine` listener) and notification badge on reconnect for missed updates
- [ ] 11.4 Complete i18next translation files for all UI strings, error messages, and notification text in both `en` and `te` locales; configure `fallbackLng: 'en'`
- [ ] 11.5 Implement language switcher UI; persist preference in `localStorage`; wire PDF exporter to active i18next language

## Phase 12: Soft Constraint Weight Configuration

- [ ] 12.1 Implement `soft_constraint_weights` CRUD endpoints (weight 1–10 per constraint key, per term); provide default values
- [ ] 12.2 Wire configured weights into the job payload sent to the Python scheduler
- [ ] 12.3 Implement weight reset to defaults endpoint

## Phase 13: Integration Testing & Property Tests

- [ ] 13.1 Set up property-based testing framework (fast-check for TypeScript/Node.js; Hypothesis for Python); configure minimum 100 iterations per property test
- [ ] 13.2 Implement all property tests referenced in tasks 2.6–2.9, 3.9–3.11, 4.4, 5.6, 6.6–6.8, 7.9–7.10, 8.5, 9.8–9.9 with tags in format `Feature: smart-timetable-system, Property N: <text>`
- [ ] 13.3 Write integration tests for the full scheduling flow: pre-validation → enqueue → Python solve → staging → apply → verify timetable_entries
- [ ] 13.4 Write integration tests for the two-phase write: verify no timetable_entries exist before apply, verify batch INSERT produces correct rows after apply
- [ ] 13.5 Write end-to-end tests for approval workflow: draft → submit → approve → published + locked
