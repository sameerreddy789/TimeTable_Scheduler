# Requirements Document

## Introduction

The Smart Timetable Management System is a web-based application for a single Higher Education Institution (college). It automates and optimizes academic timetable scheduling using a rule-based constraint satisfaction approach. The system manages rooms, faculty, subjects, and academic structure, then generates conflict-free timetable options for administrator review and approval. The MVP covers ten core modules: authentication, infrastructure setup, academic structure, subject/workload configuration, faculty management, timeslot management, scheduling engine, timetable view/management, free room detection, and elective handling.

## Glossary

- **System**: The Smart Timetable Management System web application
- **Super_Admin**: A user role with full access to all system configuration and management features
- **Department_Admin**: A user role scoped to a single department with access to that department's data
- **Faculty**: A user role with read-only access to view assigned timetables
- **Authority**: A user role (Principal or designated approver) with permission to approve or reject published timetables
- **Scheduler**: The rule-based constraint satisfaction engine that generates timetable options
- **Timetable**: A weekly schedule mapping subjects, faculty, rooms, and timeslots for a given batch
- **Batch**: A specific group of students identified by department, academic year, and section (e.g., CSE–2nd Year–Sec 1)
- **Timeslot**: A named, admin-defined time period within a day (e.g., 09:00–10:00)
- **Room**: A physical space with a defined type, capacity, and availability
- **Room_Type**: One of three categories: Classroom, Lab, or Seminar_Hall
- **Subject**: An academic course with a defined type (Theory, Lab, or Elective), weekly hours, and assigned faculty
- **Hard_Constraint**: A scheduling rule that must never be violated
- **Soft_Constraint**: A scheduling preference used to rank and optimize generated timetable options
- **Conflict_Score**: A numeric value representing the number of soft constraint violations in a generated timetable option
- **Utilization_Rate**: The percentage of available timeslots in which a room or faculty member is scheduled
- **Elective**: A subject that students from multiple departments or batches may attend together
- **NEP_2020**: National Education Policy 2020, which mandates flexible elective offerings across departments
- **Audit_Log**: A timestamped record of user actions within the system
- **CSP**: Constraint Satisfaction Problem, the algorithmic approach used by the Scheduler
- **PDF_Exporter**: The component responsible for generating downloadable PDF timetables
- **Excel_Importer**: The component responsible for parsing bulk data uploads from Excel files
- **Drag_Drop_Editor**: The UI component that allows manual timetable slot editing with live re-validation
- **Heatmap**: A visual representation of room utilization across a building over time
- **Wizard**: The Guided Setup Wizard, a step-by-step UI flow that guides Super Admins through initial system configuration in the correct order
- **Pre-Validation Engine**: The component that runs automated checks on all configuration data before a scheduling run to surface data issues early
- **Readiness_Score**: A percentage value representing the proportion of Pre-Validation checks that passed out of the total checks run
- **Readiness_Report**: The output of the Pre-Validation Engine listing each failed check with a description and a link to the relevant configuration screen
- **Academic_Term**: A named academic period (e.g., 2026_Sem1) used to isolate timetable data across semesters
- **Timetable_Version**: A numbered snapshot of a timetable draft (e.g., Draft_v1, Draft_v2, Published_v1)
- **Optimistic_Lock**: A concurrency control mechanism using version numbers to detect simultaneous edits
- **Room_Feature**: An optional physical attribute of a room (e.g., Projector, Smart_Board, AC, Computer_Lab)
- **Public_API**: A set of authenticated REST endpoints exposing read-only timetable and availability data for external integrations
- **Consecutive_Class_Limit**: The maximum number of back-to-back teaching periods a faculty member may be assigned without a break timeslot in between
- **Building_Proximity**: A soft constraint that penalizes timetable assignments where a Batch or faculty member must move between different buildings within consecutive timeslots
- **Session_Duration_Rule**: A per-subject configuration that defines how weekly hours must be split across individual class sessions (e.g., 3 hours/week as 1+1+1 or 2+1)
- **Blackout_Date**: A date on which no classes may be scheduled or rescheduled, used to represent public holidays, college events, or institutional closures
- **Parallel_Section**: Two or more Batches within the same department, academic year, and subject that share a faculty member but occupy separate rooms and must be scheduled in the same timeslot
- **Primary_Department**: The department that owns a faculty member's primary appointment and counts their full workload
- **Secondary_Department**: A department to which a faculty member is partially assigned for elective or cross-department teaching, with a separately configured workload allocation
- **CP_SAT**: Constraint Programming with Boolean Satisfiability, the solver algorithm used by Google OR-Tools to find optimal solutions to constraint satisfaction problems
- **PWA**: Progressive Web Application, a web app that can be installed on a device and accessed offline using service workers and cached data
- **Conflict_Resolver**: The AI-assisted component that suggests minimal-disruption fixes when a manual timetable edit creates a Hard_Constraint violation
- **DPDP**: Digital Personal Data Protection Act 2023, the Indian legislation governing the collection, storage, and processing of personal data
- **i18n**: Internationalization, the process of designing the system so that UI labels, error messages, and exports can be rendered in multiple languages without code changes

---

## Requirements

### Requirement 1: User Authentication

**User Story:** As a college administrator, I want secure login with role-based access, so that only authorized users can access and modify timetable data.

#### Acceptance Criteria

1. WHEN a user submits valid credentials, THE System SHALL authenticate the user and establish a session with a JWT token expiring after 8 hours.
2. WHEN a user submits invalid credentials, THE System SHALL reject the login attempt and return a descriptive error message without revealing which field was incorrect.
3. WHEN a user's session token expires, THE System SHALL redirect the user to the login page and invalidate the token server-side.
4. THE System SHALL enforce role-based access control, granting each authenticated user access only to the features permitted for their assigned role (Super_Admin, Department_Admin, Faculty, or Authority).
5. WHEN a user performs any create, update, or delete action, THE System SHALL record an Audit_Log entry containing the user ID, role, action type, affected resource, and UTC timestamp.
6. IF a user attempts to access a resource outside their role's permissions, THEN THE System SHALL return an HTTP 403 response and log the unauthorized access attempt.
7. THE Super_Admin SHALL be able to create, update, deactivate, and assign roles to user accounts.
8. ALL user passwords SHALL be hashed as specified in Requirement 21.1.
9. THE System SHALL rate-limit login attempts as specified in Requirement 21.2.

---

### Requirement 2: Room Management

**User Story:** As a Super Admin, I want to define and manage physical rooms, so that the Scheduler can assign appropriate spaces to classes.

#### Acceptance Criteria

1. THE Super_Admin SHALL be able to create a room record with the following required fields: Room Number, Room_Type (Classroom, Lab, or Seminar_Hall), capacity (positive integer), building name, available days (subset of Monday–Saturday), and available timeslots.
2. WHEN a room record is saved, THE System SHALL validate that capacity is a positive integer greater than zero and that at least one available day and one available timeslot are specified.
3. IF a room record fails validation, THEN THE System SHALL return a descriptive error identifying each invalid field without saving the record.
4. THE System SHALL calculate and display the total number of rooms grouped by Room_Type.
5. WHEN a timeslot is assigned to a room in a published timetable, THE System SHALL update that room's occupancy status to "occupied" for that timeslot.
6. WHILE a room is marked as occupied for a given timeslot, THE System SHALL prevent the Scheduler from assigning another class to that room in the same timeslot.
7. THE Super_Admin SHALL be able to update or deactivate a room record; deactivated rooms SHALL be excluded from future scheduling runs.

---

### Requirement 3: Academic Structure Setup

**User Story:** As a Super Admin, I want to configure the college's academic structure, so that timetables can be generated for every department, year, and section.

#### Acceptance Criteria

1. THE Super_Admin SHALL be able to create and manage departments with a configurable name and code (e.g., CSE, AIML, ECE, MECH, MBA).
2. THE System SHALL support academic years: 1st Year, 2nd Year, 3rd Year, 4th Year, PG Year 1, and PG Year 2.
3. THE Super_Admin SHALL be able to create a Batch by specifying department, academic year, section label, and student strength (positive integer).
4. WHEN a Batch is created, THE System SHALL validate that the student strength is a positive integer and that the combination of department, academic year, and section label is unique.
5. IF a duplicate Batch combination is submitted, THEN THE System SHALL reject the request and return an error identifying the conflict.
6. THE Department_Admin SHALL be able to view and manage Batches within their assigned department only.
7. THE Department_Admin SHALL be able to mark two or more Batches within the same department and academic year as Parallel_Sections of the same subject, indicating they share a faculty member but require separate room assignments.
8. WHEN Batches are designated as Parallel_Sections for a subject, THE Scheduler SHALL enforce as a Hard_Constraint that all Parallel_Sections of that subject are assigned to the same timeslot in every generated timetable option.
9. WHEN Batches are designated as Parallel_Sections, THE Scheduler SHALL assign each Parallel_Section to a distinct room; no two Parallel_Sections SHALL share the same room in the same timeslot.

---

### Requirement 4: Subject and Workload Configuration

**User Story:** As a Department Admin, I want to define subjects and their scheduling requirements per batch, so that the Scheduler has accurate workload data.

#### Acceptance Criteria

1. THE Department_Admin SHALL be able to create a subject record specifying: subject name, subject code, type (Theory, Lab, or Elective), weekly hours (positive integer), classes per week (positive integer), preferred Room_Type, assigned faculty member, and whether a fixed timeslot is required.
2. WHEN a subject record is saved, THE System SHALL validate that weekly hours equals classes per week multiplied by the duration of one class period in hours.
3. IF a subject of type Lab is created without a preferred Room_Type of Lab, THEN THE System SHALL display a warning and require explicit confirmation before saving.
4. WHEN a subject requires a fixed timeslot, THE System SHALL allow the Department_Admin to specify the exact day and timeslot, and THE Scheduler SHALL treat that assignment as immutable during scheduling runs.
5. THE System SHALL prevent deletion of a subject record that is referenced in a published timetable.
6. THE Department_Admin SHALL be able to define a Session_Duration_Rule for each subject, specifying how the subject's weekly hours must be split across individual sessions (e.g., a 3-hour/week subject may be configured as three 1-hour sessions, or one 2-hour session plus one 1-hour session). THE Scheduler SHALL enforce this split pattern when assigning timeslots.

---

### Requirement 5: Faculty Management

**User Story:** As a Department Admin, I want to configure faculty availability and workload limits, so that the Scheduler can assign classes without overloading any faculty member.

#### Acceptance Criteria

1. THE Department_Admin SHALL be able to create a faculty profile specifying: full name, Primary_Department, one or more Secondary_Departments with a workload allocation percentage for each, subjects handled (one or more, each tagged to a department), maximum classes per day (positive integer), maximum classes per week (positive integer, applied across all departments combined), average leave days per month, preferred timeslots, and not-available timeslots.
2. WHEN a faculty profile is saved, THE System SHALL validate that maximum classes per day is less than or equal to the total number of timeslots in a day.
3. THE System SHALL calculate and display each faculty member's current scheduled classes per week against their maximum classes per week limit.
4. WHEN a faculty member's scheduled classes per week reaches their maximum classes per week limit, THE System SHALL flag that faculty member as fully loaded and exclude them from further automatic assignments in the current scheduling run.
5. WHEN a faculty member's scheduled classes per week exceeds their maximum classes per week limit, THE System SHALL display an overload warning on the faculty management dashboard.
6. THE System SHALL display the number of free periods per day for each faculty member based on the current active timetable.
7. THE Department_Admin SHALL be able to define a Consecutive_Class_Limit for each faculty member (positive integer, default 2), representing the maximum number of back-to-back teaching periods allowed without an intervening break timeslot.
8. THE System SHALL calculate and display a faculty member's workload split across their Primary_Department and any Secondary_Departments, showing scheduled classes per department against the configured workload allocation for each.

---

### Requirement 6: Timeslot Management

**User Story:** As a Super Admin, I want to manually define the daily timeslot structure, so that all scheduling is based on institutionally approved time periods.

#### Acceptance Criteria

1. THE Super_Admin SHALL be able to create a timeslot by specifying a label, start time, end time, and shift (Morning or Evening).
2. THE Super_Admin SHALL be able to designate a timeslot as a break period; break timeslots SHALL be excluded from class assignments by the Scheduler.
3. THE Super_Admin SHALL be able to group two consecutive timeslots into a lab block; THE Scheduler SHALL assign Lab subjects only to lab blocks and SHALL treat the two timeslots as a single atomic unit.
4. WHEN a timeslot is updated or deleted, THE System SHALL check for existing timetable assignments referencing that timeslot and SHALL prevent the change if active assignments exist, returning a descriptive error.
5. THE System SHALL display all defined timeslots ordered by shift and start time.
6. THE Scheduler SHALL NOT create, modify, or delete timeslot definitions; timeslot management is exclusively an administrative function.
7. Lab blocks SHALL always consist of exactly 2 consecutive timeslots of equal duration; the duration of a lab block SHALL be configurable by the Super_Admin.

---

### Requirement 7: Rule-Based Scheduling Engine

**User Story:** As a Department Admin, I want the system to automatically generate valid timetable options, so that I can choose the best schedule without manually resolving conflicts.

#### Acceptance Criteria

1. WHEN a scheduling run is initiated for a department and semester, THE Scheduler SHALL generate between 3 and 5 distinct timetable options.
2. THE Scheduler SHALL enforce all Hard_Constraints; no generated timetable option SHALL contain a Hard_Constraint violation.
3. THE Scheduler SHALL enforce the following Hard_Constraints:
   a. No two classes SHALL be assigned to the same room in the same timeslot (room clash).
   b. No faculty member SHALL be assigned to two classes in the same timeslot (faculty clash).
   c. The capacity of the assigned room SHALL be greater than or equal to the student strength of the Batch.
   d. The total number of classes assigned per subject per week SHALL equal the subject's defined classes per week value.
   e. The number of classes assigned to a faculty member per day SHALL not exceed that faculty member's maximum classes per day.
   f. Subjects with a fixed timeslot SHALL be assigned to that exact timeslot in every generated option.
   g. Lab subjects SHALL be assigned only to rooms with Room_Type of Lab.
   h. Lab subjects SHALL be assigned only to lab blocks (two consecutive timeslots treated as one unit).
   i. Each class session assigned for a subject SHALL conform to that subject's Session_Duration_Rule; sessions that violate the defined split pattern SHALL NOT be generated.
   j. All Parallel_Sections of the same subject SHALL be assigned to the same timeslot (Parallel_Section synchronization constraint).
4. THE Scheduler SHALL optimize each generated option against the following Soft_Constraints, minimizing the Conflict_Score:
   a. Minimize gaps between classes in a Batch's daily schedule.
   b. Distribute each faculty member's weekly classes as evenly as possible across available days.
   c. Distribute room usage as evenly as possible across all available rooms of the required type.
   d. Avoid scheduling two consecutive theory-heavy subjects for the same Batch on the same day.
   e. Distribute a subject's weekly classes across different days rather than clustering them.
   f. Avoid assigning a faculty member more consecutive teaching periods than their defined Consecutive_Class_Limit; violations SHALL contribute to the Conflict_Score.
   g. Prefer assigning consecutive classes for the same Batch to rooms within the same building; cross-building transitions within consecutive timeslots SHALL contribute to the Conflict_Score.
5. WHEN a scheduling run completes, THE System SHALL display each generated option with its Conflict_Score and room Utilization_Rate.
6. WHEN no valid timetable can be generated due to insufficient resources, THE Scheduler SHALL return a detailed infeasibility report listing each unsatisfied Hard_Constraint and the resource causing the conflict.
7. FOR ALL generated timetable options, THE Scheduler SHALL guarantee that no room clash Hard_Constraint is violated (no two classes in the same room at the same timeslot).
8. FOR ALL generated timetable options, THE Scheduler SHALL guarantee that no faculty clash Hard_Constraint is violated (no faculty member assigned to two simultaneous classes).
9. FOR ALL generated timetable options, THE Scheduler SHALL guarantee that room capacity is never less than the Batch student strength for any assignment.
10. FOR ALL generated timetable options, THE Scheduler SHALL guarantee that the total assigned classes per subject per week equals the subject's required classes per week.
11. FOR ALL generated timetable options, THE Scheduler SHALL guarantee that Lab subjects are assigned exclusively to rooms with Room_Type of Lab.
12. WHEN a scheduling run produces multiple timetable options, THE System SHALL display them in a side-by-side comparison view showing each option's Conflict_Score, room Utilization_Rate, faculty load distribution, and number of gap periods per batch.
13. THE Department_Admin SHALL be able to select any two generated options for detailed side-by-side comparison before choosing the final timetable.
14. THE Scheduler SHALL run all timetable assignments within a single database transaction as specified in Requirement 19.5.
15. THE Scheduler SHALL NOT assign any class to a timeslot that falls on a Blackout_Date; Blackout_Dates SHALL be treated as Hard_Constraints equivalent to room unavailability.
16. THE Scheduler SHALL use the Google OR-Tools CP-SAT solver as its core constraint satisfaction engine; the scheduling run SHALL be configured with a solver timeout equal to the performance benchmarks defined in Requirement 19 (30 seconds for ≤50 batches, 60 seconds for ≤100 batches), after which the best feasible solution found within the timeout SHALL be returned.
17. THE Scheduler SHALL be configured to generate a solution pool of 3–5 distinct timetable options by running the CP-SAT solver with different randomization seeds; each option in the pool SHALL satisfy all Hard_Constraints.

---

### Requirement 8: Timetable View and Management

**User Story:** As a Department Admin or Authority, I want to view, edit, and approve timetables, so that the final published schedule is accurate and officially sanctioned.

#### Acceptance Criteria

1. THE System SHALL display timetables filterable by department, academic year, and section.
2. THE System SHALL render the timetable in a mobile-friendly grid layout with timeslots as columns and days as rows.
3. THE PDF_Exporter SHALL generate a downloadable PDF of any timetable view, preserving the grid layout and including department, batch, and semester metadata.
4. THE Drag_Drop_Editor SHALL allow a Department_Admin to move a class assignment to a different timeslot or room by dragging and dropping within the timetable grid.
5. WHEN a drag-and-drop edit is performed, THE System SHALL immediately re-validate all Hard_Constraints and highlight any resulting conflicts in red within the timetable grid.
6. WHEN a conflict is detected after a manual edit, THE System SHALL display a descriptive conflict message identifying the violated Hard_Constraint and the affected resources.
7. WHEN a Department_Admin submits a timetable for approval, THE System SHALL notify the Authority and set the timetable status to "Pending Approval".
8. WHEN an Authority approves a timetable, THE System SHALL set the timetable status to "Published" and lock the timetable against further edits.
9. WHEN an Authority rejects a timetable, THE System SHALL set the timetable status to "Rejected", record the rejection reason, and notify the Department_Admin.
10. WHILE a timetable has "Published" status, THE System SHALL prevent any edit operations on that timetable's assignments.
11. THE System SHALL export timetable data in Excel format and in Google Calendar-compatible iCalendar (.ics) format.
12. THE System SHALL support semester rollover: a Department_Admin SHALL be able to copy a previously published timetable as a draft for a new semester, carrying forward all subject, faculty, and room assignments as editable starting points.
13. WHEN a semester rollover is initiated, THE System SHALL run the Pre-Validation Engine on the copied draft and flag any assignments that are no longer valid (e.g., faculty no longer available, room deactivated).
14. WHEN a drag-and-drop edit creates a Hard_Constraint violation, THE Conflict_Resolver SHALL automatically suggest 2–3 alternative slot swaps that resolve the conflict with the minimum increase in Conflict_Score, displaying each suggestion with its projected Conflict_Score delta before the user commits.

---

### Requirement 9: Free Room Detection and Booking

**User Story:** As an administrator, I want to find available rooms for a given date and time, so that I can book spaces for ad-hoc events without conflicts.

#### Acceptance Criteria

1. WHEN an administrator selects a date and time range, THE System SHALL return a list of all rooms that have no timetable assignment or booking for any timeslot within that range.
2. THE System SHALL display each free room's Room_Type, capacity, and building name in the search results.
3. WHEN an administrator books a free room for a date and time range, THE System SHALL create a booking record and mark that room as occupied for the specified timeslots.
4. IF a room is already occupied for any timeslot within the requested booking range, THEN THE System SHALL exclude that room from the free room results.
5. THE System SHALL display a Heatmap view showing room Utilization_Rate per building per timeslot for the current week.
6. WHEN a booking is created, THE System SHALL record the booking in the Audit_Log with the user ID, room ID, date, and time range.

---

### Requirement 10: Elective Handling (NEP 2020)

**User Story:** As a Department Admin, I want to configure elective subjects that span multiple departments, so that students from different batches can attend the same elective class together.

#### Acceptance Criteria

1. THE Department_Admin SHALL be able to designate a subject of type Elective and associate it with one or more Batches from different departments.
2. WHEN an Elective subject is associated with multiple Batches, THE System SHALL calculate the combined student strength as the sum of the student strengths of all associated Batches.
3. WHEN the Scheduler assigns an Elective subject, THE System SHALL select a room whose capacity is greater than or equal to the combined student strength of all associated Batches.
4. WHEN the Scheduler assigns an Elective subject, THE System SHALL enforce the faculty clash Hard_Constraint across all associated Batches simultaneously.
5. WHEN the Scheduler assigns an Elective subject, THE System SHALL enforce the room clash Hard_Constraint for the combined session.
6. THE System SHALL display Elective sessions in the timetable view of every associated Batch.

---

### Requirement 11: Analytics Dashboard

**User Story:** As a Super Admin or Department Admin, I want to view utilization and workload analytics, so that I can identify scheduling inefficiencies and plan resources better.

#### Acceptance Criteria

1. THE System SHALL display room Utilization_Rate as a percentage for each room, calculated as scheduled timeslots divided by total available timeslots for the current active timetable period.
2. THE System SHALL display faculty load distribution showing each faculty member's scheduled classes per week against their maximum classes per week.
3. THE System SHALL identify and display the top three most congested days of the week based on the number of simultaneous classes scheduled.
4. THE System SHALL display the total number of free periods per day aggregated across all Batches.
5. WHEN a Department_Admin views the dashboard, THE System SHALL scope all analytics to that Department_Admin's assigned department.

---

### Requirement 12: Bulk Data Import via Excel

**User Story:** As a Super Admin, I want to import rooms, faculty, subjects, and batch data from Excel files, so that I can set up the system quickly without manual data entry.

#### Acceptance Criteria

1. THE Excel_Importer SHALL accept Excel files (.xlsx format) for bulk import of rooms, faculty profiles, subjects, and batch records.
2. WHEN an Excel file is uploaded, THE Excel_Importer SHALL validate each row against the same validation rules applied to manual data entry.
3. WHEN validation errors are found in an uploaded file, THE Excel_Importer SHALL reject the entire import, return a report listing each row number and the specific validation error, and make no changes to the database.
4. WHEN an Excel file passes validation, THE Excel_Importer SHALL import all records atomically; if any database write fails, THE Excel_Importer SHALL roll back all changes from that import batch.
5. THE System SHALL provide downloadable Excel template files for each importable entity type (rooms, faculty, subjects, batches) with column headers and example rows.

---

### Requirement 13: Dynamic Rescheduling on Faculty Leave

**User Story:** As a Department Admin, I want the system to suggest replacements when a faculty member applies for leave, so that affected classes can be rescheduled with minimal disruption.

#### Acceptance Criteria

1. WHEN a faculty member's leave is recorded for a specific date, THE System SHALL identify all classes assigned to that faculty member on that date in the active timetable.
2. WHEN affected classes are identified, THE System SHALL suggest replacement faculty members ranked by: (1) subject expertise match, (2) current daily load (ascending), (3) number of past substitutions in the current semester (ascending, to distribute substitution load fairly), and (4) availability in the affected timeslots without exceeding maximum classes per day.
3. THE System SHALL present each suggestion with: the replacement faculty member's name, subject expertise match status, current daily load, total substitutions this semester, and any resulting Soft_Constraint changes.
4. WHEN a Department_Admin selects a replacement suggestion, THE System SHALL apply the swap, update the timetable, and record the change in the Audit_Log.
5. IF no eligible replacement faculty member exists for an affected class, THEN THE System SHALL notify the Department_Admin and mark the class as unresolved.

---

### Requirement 14: Guided Setup Wizard

**User Story:** As a Super Admin setting up the system for the first time, I want a guided setup wizard, so that I configure all required data in the correct order before running the scheduler.

#### Acceptance Criteria

1. THE System SHALL provide a Guided Setup Wizard with the following sequential steps: (1) Departments, (2) Academic Years & Batches, (3) Rooms, (4) Timeslots, (5) Faculty, (6) Subjects & Workload, (7) Review & Validate, (8) Generate Timetable.
2. THE Wizard SHALL display a progress indicator showing the current step, completed steps, and remaining steps.
3. THE Wizard SHALL prevent advancing to a later step if required data for the current step is incomplete, displaying a descriptive message listing the missing items.
4. AT step 7 (Review & Validate), THE System SHALL run the Pre-Validation Engine (see Requirement 16) and display the readiness report before allowing the user to proceed to scheduling.
5. THE Super_Admin SHALL be able to exit the wizard at any step and resume from the same step later.
6. WHEN all steps are completed and validation passes, THE Wizard SHALL enable the "Generate Timetable" action and transition to the scheduling engine.

---

### Requirement 15: Shareable Public Timetable Links

**User Story:** As a Department Admin, I want to generate shareable timetable links for each batch and faculty member, so that students and faculty can view their schedules without needing a system account.

#### Acceptance Criteria

1. WHEN a timetable is published, THE System SHALL generate a unique, unguessable public URL for each Batch timetable and each Faculty timetable.
2. THE public URL SHALL display the timetable in a read-only, mobile-friendly grid view without requiring authentication.
3. WHEN a published timetable is updated (e.g., via substitution or manual edit), THE System SHALL reflect the change on the public URL within 5 seconds without requiring the link to be regenerated or reshared.
4. THE Department_Admin SHALL be able to revoke and regenerate a public URL for any Batch or Faculty timetable.
5. THE System SHALL display the shareable link alongside a QR code that encodes the same URL, allowing physical posting on notice boards.
6. THE public timetable view SHALL display the batch name, department, academic year, section, and the date the timetable was last updated.

---

### Requirement 16: Pre-Validation Engine

**User Story:** As a Department Admin, I want the system to validate all input data before running the scheduler, so that I can fix configuration issues before wasting time on a failed scheduling run.

#### Acceptance Criteria

1. WHEN a scheduling run is requested, THE Pre-Validation Engine SHALL run automatically before the Scheduler starts and SHALL check for all of the following conditions:
   a. Every subject has at least one assigned faculty member.
   b. Every faculty member's maximum classes per day does not exceed the total number of non-break timeslots in a day.
   c. Every Lab subject has at least one Lab room available with sufficient capacity.
   d. The total weekly class hours required across all subjects for a Batch does not exceed the total available timeslots per week for that Batch.
   e. No two subjects for the same Batch have conflicting fixed timeslot assignments.
   f. Every Elective subject has at least one room with capacity >= combined student strength of all associated Batches.
   g. No faculty member is assigned more weekly classes (across all subjects) than their maximum classes per week limit.
   h. No subject's Session_Duration_Rule requires a session duration that exceeds the duration of a single available timeslot (unless a lab block is configured).
   i. No faculty member's total daily teaching load across all assigned subjects exceeds their Consecutive_Class_Limit multiplied by 2 (i.e., the maximum possible non-consecutive teaching periods in a day).
2. IF any Pre-Validation check fails, THE System SHALL display a Readiness Report listing each failed check with a plain-language description and a direct link to the configuration screen where the issue can be resolved.
3. THE System SHALL display a Readiness Score as a percentage (checks passed / total checks) on the Readiness Report.
4. THE Scheduler SHALL NOT start if any Pre-Validation check fails; the user must resolve all issues and re-run validation.
5. WHEN all Pre-Validation checks pass, THE System SHALL display a "Ready to Schedule" confirmation and allow the scheduling run to proceed.
6. THE Pre-Validation Engine SHALL complete all checks within 10 seconds for institutions with up to 50 batches, 200 faculty members, and 100 rooms.

---

### Requirement 17: In-App and Email Notifications

**User Story:** As a system user, I want to receive notifications for important timetable events, so that I am always informed of changes that affect me without checking the system manually.

#### Acceptance Criteria

1. WHEN a Department_Admin submits a timetable for approval, THE System SHALL send an in-app notification and email to all Authority users.
2. WHEN an Authority approves or rejects a timetable, THE System SHALL send an in-app notification and email to the submitting Department_Admin, including the rejection reason if applicable.
3. WHEN a faculty member is assigned as a substitute for a class, THE System SHALL send an in-app notification and email to that faculty member specifying the date, timeslot, subject, and batch.
4. WHEN a faculty member's scheduled classes per week reaches 90% of their maximum classes per week limit, THE System SHALL send an in-app notification to the Department_Admin.
5. THE System SHALL display an unread notification count badge on the navigation bar for each authenticated user.
6. EACH user SHALL be able to configure their notification preferences, choosing to enable or disable email notifications for each notification type independently.
7. THE System SHALL retain notification history for each user for a minimum of 90 days.
8. All timestamps in notifications SHALL be stored in UTC and displayed in the institution's configured local timezone.
9. IF an email delivery attempt fails, THEN THE System SHALL log the failure and automatically retry delivery up to 3 times with exponential backoff before marking the notification as failed.

---

### Requirement 18: Academic Term & Version Control

**User Story:** As a Super Admin, I want timetable data isolated by academic term with full version history, so that past schedules are preserved and new semesters start clean.

#### Acceptance Criteria

1. THE System SHALL associate every timetable, subject assignment, and room booking with a specific Academic_Term (e.g., 2026_Sem1, 2026_Sem2).
2. Rooms, faculty profiles, and subject definitions SHALL be reusable across Academic_Terms without duplication.
3. THE System SHALL maintain Timetable_Versions for each draft (Draft_v1, Draft_v2, etc.) and published state (Published_v1).
4. WHEN a timetable is published, THE System SHALL mark it as immutable and archive it; no further edits SHALL be permitted on a published version.
5. THE Super_Admin SHALL be able to view any historical timetable by selecting an Academic_Term and version.
6. THE Department_Admin SHALL be able to roll back to any previous draft version of a timetable within the current Academic_Term.
7. WHEN a new Academic_Term is created, THE System SHALL not carry forward any timetable assignments from the previous term; only reusable master data (rooms, faculty, subjects) SHALL be available.

---

### Requirement 19: Non-Functional Performance Requirements

**User Story:** As a system operator, I want defined performance benchmarks, so that the system remains responsive under real institutional load.

#### Acceptance Criteria

1. THE Scheduler SHALL complete generation of 3–5 timetable options within 30 seconds for institutions with up to 50 batches.
2. THE Scheduler SHALL complete generation of 3–5 timetable options within 60 seconds for institutions with up to 100 batches.
3. THE System SHALL support a minimum of 100 rooms, 200 faculty members, and 1,000 subjects without degradation in scheduling performance.
4. THE System SHALL support at least 500 concurrent authenticated users without response time exceeding 2 seconds for standard read operations.
5. THE Scheduler SHALL execute all timetable assignments within a single database transaction; IF the scheduling run fails or is cancelled at any point, THEN no partial timetable assignments SHALL be persisted to the database.
6. Generated timetable options SHALL be stored as temporary draft objects and SHALL NOT be committed as active timetable data until the Department_Admin explicitly selects one.

---

### Requirement 20: Concurrency Protection

**User Story:** As a Department Admin, I want the system to prevent conflicting simultaneous edits, so that two admins cannot overwrite each other's timetable changes.

#### Acceptance Criteria

1. THE System SHALL implement Optimistic_Lock on all timetable records using an integer version number that increments on every save.
2. WHEN a user attempts to save a timetable edit, THE System SHALL compare the submitted version number against the current database version number.
3. IF the submitted version number does not match the current database version number, THEN THE System SHALL reject the save, display a conflict warning identifying the conflicting user, and present the user with options to reload the latest version or discard their changes.
4. THE System SHALL display a real-time indicator when another user has the same timetable open for editing.

---

### Requirement 21: Security Requirements

**User Story:** As a system operator, I want the application to meet baseline security standards, so that institutional data is protected from unauthorized access and common attacks.

#### Acceptance Criteria

1. ALL user passwords SHALL be hashed using bcrypt with a minimum cost factor of 12 before storage; plaintext passwords SHALL never be stored or logged.
2. THE System SHALL rate-limit login attempts to a maximum of 5 failed attempts per IP address per 15-minute window; accounts SHALL be temporarily locked after 10 consecutive failed attempts.
3. ALL state-changing HTTP requests SHALL include CSRF token validation.
4. THE System SHALL enforce HTTPS for all client-server communication; HTTP requests SHALL be redirected to HTTPS.
5. Public timetable link tokens SHALL be generated using cryptographically secure random UUIDs with a minimum of 128-bit entropy.
6. ALL API endpoints SHALL validate and sanitize input to prevent SQL injection and XSS attacks.
7. THE System SHALL set secure, HttpOnly, and SameSite=Strict flags on all session cookies.
8. In compliance with the DPDP Act 2023, THE Public_API SHALL anonymize all personal data in responses by default; faculty names SHALL be replaced with role identifiers (e.g., "Faculty_001") and student counts SHALL be returned as ranges (e.g., "31–40") unless the requesting API key has been explicitly granted a data access consent flag by the Super_Admin.
9. THE Super_Admin SHALL be able to configure public timetable links to require a short-lived access token (valid for 24 hours) instead of a permanent UUID, providing protection against automated scraping of published timetables.

---

### Requirement 22: Soft Constraint Weight Configuration

**User Story:** As a Super Admin, I want to assign weights to soft constraints, so that the scheduling engine prioritizes what matters most to my institution.

#### Acceptance Criteria

1. THE Super_Admin SHALL be able to assign a numeric weight (integer 1–10) to each Soft_Constraint defined in Requirement 7.4.
2. THE Scheduler SHALL calculate the Conflict_Score for each generated timetable option as the weighted sum of soft constraint violations, where each violation's contribution equals the number of violations multiplied by the constraint's configured weight.
3. THE System SHALL provide default weight values for all Soft_Constraints that produce reasonable scheduling behavior without manual configuration.
4. WHEN weights are updated, THE change SHALL apply to the next scheduling run and SHALL NOT retroactively alter the scores of previously generated options.
5. THE Super_Admin SHALL be able to reset all weights to their default values.

---

### Requirement 23: Room Feature Tags

**User Story:** As a Super Admin, I want to tag rooms with physical features, so that subjects requiring specific equipment are assigned to appropriate rooms.

#### Acceptance Criteria

1. THE Super_Admin SHALL be able to assign one or more Room_Feature tags to a room from a configurable list including: Projector, Smart_Board, AC, Computer_Lab, and custom tags defined by the Super_Admin.
2. THE Department_Admin SHALL be able to specify required Room_Feature tags for a subject.
3. WHEN the Scheduler assigns a room to a subject with required Room_Feature tags, THE Scheduler SHALL only consider rooms that have all required tags.
4. IF no room with the required Room_Feature tags is available for a subject, THEN THE Pre-Validation Engine SHALL flag this as a failed check in the Readiness_Report before the scheduling run begins.
5. Room_Feature tag requirements SHALL be treated as Hard_Constraints during scheduling.

---

### Requirement 24: Student Maximum Weekly Load

**User Story:** As a Department Admin, I want to define a maximum weekly class limit per batch, so that students are not over-scheduled beyond institutional guidelines.

#### Acceptance Criteria

1. THE Department_Admin SHALL be able to define a maximum weekly class limit (positive integer) for each Batch.
2. THE Scheduler SHALL enforce the maximum weekly class limit as a Hard_Constraint; no generated timetable option SHALL assign more classes per week to a Batch than its defined maximum weekly class limit.
3. WHEN the total required weekly classes across all subjects for a Batch exceeds the Batch's maximum weekly class limit, THE Pre-Validation Engine SHALL flag this as a failed check in the Readiness_Report.
4. FOR ALL generated timetable options, THE Scheduler SHALL guarantee that no Batch's total assigned classes per week exceeds its maximum weekly class limit.

---

### Requirement 25: Public REST API

**User Story:** As a developer or system integrator, I want a public REST API, so that timetable data can be consumed by mobile apps, student portals, or third-party systems.

#### Acceptance Criteria

1. THE System SHALL expose a Public_API with the following read-only endpoints:
   a. GET /api/timetable/{batch_id} — returns the published timetable for a batch in JSON format.
   b. GET /api/timetable/faculty/{faculty_id} — returns the published timetable for a faculty member in JSON format.
   c. GET /api/rooms/available — accepts date and time range parameters and returns available rooms matching the query.
   d. GET /api/faculty/{faculty_id}/leave — returns recorded leave dates for a faculty member.
2. ALL Public_API endpoints SHALL require API key authentication; unauthenticated requests SHALL return HTTP 401.
3. THE Public_API SHALL enforce rate limiting of 100 requests per minute per API key.
4. THE Public_API SHALL return responses in JSON format with consistent error response structure including error code, message, and timestamp.
5. THE System SHALL provide API documentation accessible at /api/docs describing all endpoints, parameters, and response schemas.

---

### Requirement 26: Holiday and Blackout Date Management

**User Story:** As a Super Admin, I want to define holidays and blackout dates in the academic calendar, so that the scheduler never assigns or reschedules classes on days the college is closed.

#### Acceptance Criteria

1. THE Super_Admin SHALL be able to create a Blackout_Date record by specifying a date, a label (e.g., "Republic Day", "College Fest"), and a scope (Institution-wide or specific departments).
2. THE Super_Admin SHALL be able to define a date range as a Blackout period (e.g., a 5-day college fest week).
3. WHEN a Blackout_Date is created, THE System SHALL immediately prevent any new timetable assignments from being made on that date.
4. THE Scheduler SHALL treat all timeslots on Blackout_Dates as unavailable; no class SHALL be assigned to a Blackout_Date timeslot in any generated timetable option.
5. WHEN the Dynamic Rescheduling engine (Requirement 13) suggests replacement slots for a faculty leave, THE System SHALL exclude all Blackout_Date timeslots from the list of suggested replacement slots.
6. THE System SHALL display all Blackout_Dates on an academic calendar view, distinguishing between institution-wide and department-specific blackouts.
7. THE Pre-Validation Engine SHALL check that no fixed-timeslot subject assignment falls on a Blackout_Date and SHALL flag any such conflict in the Readiness_Report.
8. THE Super_Admin SHALL be able to update or delete a Blackout_Date; WHEN a Blackout_Date is deleted, THE System SHALL NOT automatically reassign any classes that were previously excluded due to that date.

---

### Requirement 27: Offline-First Faculty PWA

**User Story:** As a faculty member, I want to view my timetable offline on my mobile device, so that I can check my schedule even when the college network is unavailable.

#### Acceptance Criteria

1. THE System's faculty timetable view SHALL be implemented as a PWA, enabling installation on Android and iOS home screens without requiring an app store download.
2. WHEN a faculty member views their timetable while online, THE PWA SHALL cache the current week's timetable data using a service worker so that it remains accessible when the device is offline.
3. WHEN the device reconnects to the network, THE PWA SHALL automatically sync and update the cached timetable with any changes made since the last online session.
4. THE PWA SHALL display a visible "Offline Mode" indicator when the device has no network connection.
5. WHEN a timetable update (e.g., substitution assignment) occurs while the faculty member is offline, THE PWA SHALL display a notification badge on next connection indicating that the cached timetable has been updated.
6. THE PWA SHALL support installation and offline access on devices running Android 8+ and iOS 14+.

---

### Requirement 28: Internationalization (i18n)

**User Story:** As a college administrator in Andhra Pradesh, I want the system interface available in both English and Telugu, so that staff who are more comfortable in Telugu can use the system effectively.

#### Acceptance Criteria

1. THE System SHALL implement i18n from the initial release, storing all UI labels, button text, error messages, validation messages, and notification text in externalized language resource files rather than hardcoded strings.
2. THE System SHALL support English (en) and Telugu (te) as the two initial supported languages.
3. THE Super_Admin SHALL be able to set the institution's default display language; individual users SHALL be able to override the display language for their own session.
4. WHEN a user selects Telugu as their display language, ALL UI text, error messages, and in-app notifications SHALL render in Telugu script.
5. THE PDF_Exporter SHALL generate timetable PDFs in the user's currently selected display language, including all labels, day names, and metadata fields.
6. THE Excel_Importer SHALL accept subject names, faculty names, and department names in both English and Telugu script without validation errors.
7. THE System SHALL fall back to English for any string that does not yet have a Telugu translation, rather than displaying a missing translation key.
