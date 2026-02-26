const { Router } = require('express');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/client');
const { authenticate, requireRole } = require('../middleware');
const { runPreValidation } = require('../validation/preValidation');
const { schedulingQueue } = require('../queue/schedulingQueue');
const { config } = require('../config');

const router = Router();
router.use(authenticate, requireRole('Super_Admin', 'Department_Admin'));

const validateSchema = z.object({ term_id: z.string().uuid(), department_id: z.string().uuid() });

router.post('/validate', async (req, res) => {
  const parsed = validateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  const client = await db.connect();
  try {
    const report = await runPreValidation(client, parsed.data.term_id, parsed.data.department_id);
    return res.status(report.score === 100 ? 200 : 422).json(report);
  } finally { client.release(); }
});

router.post('/run', async (req, res) => {
  const parsed = validateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  const { term_id, department_id } = parsed.data;
  const user = req.user;
  const correlationId = req.correlationId ?? uuidv4();

  const client = await db.connect();
  let report;
  try { report = await runPreValidation(client, term_id, department_id); }
  finally { client.release(); }
  if (report.score < 100) return res.status(422).json({ error: 'Pre-validation failed', report });

  const [rooms, faculty, subjects, batches, assignments, timeslots, parallelGroups, softWeights] =
    await Promise.all([
      db.query(`SELECT r.*, COALESCE(array_agg(rft.tag) FILTER (WHERE rft.tag IS NOT NULL), '{}') AS features
                FROM rooms r LEFT JOIN room_feature_tags rft ON rft.room_id=r.id WHERE r.is_active=TRUE GROUP BY r.id`),
      db.query(`SELECT fp.*, COALESCE(array_agg(ftp.timeslot_id) FILTER (WHERE ftp.pref_type='not_available'), '{}') AS not_available_timeslots
                FROM faculty_profiles fp LEFT JOIN faculty_timeslot_prefs ftp ON ftp.faculty_id=fp.id GROUP BY fp.id`),
      db.query(`SELECT s.*, sdr.session_durations FROM subjects s LEFT JOIN session_duration_rules sdr ON sdr.subject_id=s.id WHERE s.department_id=$1`, [department_id]),
      db.query(`SELECT * FROM batches WHERE department_id=$1`, [department_id]),
      db.query(`SELECT * FROM subject_assignments WHERE term_id=$1`, [term_id]),
      db.query(`SELECT * FROM timeslots ORDER BY shift, start_time`),
      db.query(`SELECT psg.*, json_agg(psm.batch_id) AS batch_ids FROM parallel_section_groups psg JOIN parallel_section_members psm ON psm.group_id=psg.id WHERE psg.term_id=$1 GROUP BY psg.id`, [term_id]),
      db.query(`SELECT constraint_key, weight FROM soft_constraint_weights WHERE term_id=$1`, [term_id]),
    ]);

  const blackouts = await db.query(`SELECT * FROM blackout_dates WHERE term_id=$1`, [term_id]);
  const bookings = await db.query(`SELECT * FROM room_bookings WHERE booking_date >= CURRENT_DATE`);

  const blockedByRoom = {};
  for (const bd of blackouts.rows) {
    for (const room of rooms.rows) {
      blockedByRoom[room.id] = blockedByRoom[room.id] ?? [];
      for (const ts of timeslots.rows) {
        blockedByRoom[room.id].push({ day: 'ALL', timeslot_id: ts.id, reason: 'blackout' });
      }
    }
  }
  for (const bk of bookings.rows) {
    blockedByRoom[bk.room_id] = blockedByRoom[bk.room_id] ?? [];
    blockedByRoom[bk.room_id].push({
      day: new Date(bk.booking_date).toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3),
      timeslot_id: bk.timeslot_id, reason: 'booking',
    });
  }

  const softWeightsMap = {};
  for (const row of softWeights.rows) softWeightsMap[row.constraint_key] = row.weight;

  const batchCount = batches.rows.length;
  const timeoutSeconds = batchCount <= 50 ? 30 : 60;
  const jobId = uuidv4();

  await db.query(
    `INSERT INTO scheduling_jobs (id,term_id,department_id,status,correlation_id) VALUES ($1,$2,$3,'pending',$4)`,
    [jobId, term_id, department_id, correlationId]
  );

  const jobPayload = {
    job_id: jobId, correlation_id: correlationId, term_id, department_id,
    rooms: rooms.rows.map(r => ({ ...r, blocked_slots: blockedByRoom[r.id] ?? [] })),
    faculty: faculty.rows, subjects: subjects.rows, batches: batches.rows,
    assignments: assignments.rows, timeslots: timeslots.rows,
    parallel_groups: parallelGroups.rows.map(pg => ({ subject_id: pg.subject_id, batch_ids: pg.batch_ids })),
    soft_weights: softWeightsMap, timeout_seconds: timeoutSeconds, num_solutions: 3,
    requested_by_user_id: user.sub,
  };

  await schedulingQueue.add('solve', jobPayload, {
    jobId, attempts: 3, backoff: { type: 'exponential', delay: 5000 },
  });

  return res.status(202).json({ job_id: jobId, message: 'Scheduling job enqueued' });
});

router.post('/:jobId/apply', async (req, res) => {
  const { selected_option_index } = req.body;
  if (typeof selected_option_index !== 'number') return res.status(400).json({ error: 'selected_option_index is required' });

  const jobRow = await db.query(`SELECT * FROM scheduling_jobs WHERE id=$1 AND status='completed'`, [req.params['jobId']]);
  if (jobRow.rowCount === 0) return res.status(404).json({ error: 'Job not found or not in completed state' });

  const job = jobRow.rows[0];
  const options = job.solution_pool;
  if (!options || selected_option_index >= options.length) return res.status(400).json({ error: 'Invalid option index' });

  const selected = options[selected_option_index];
  const pgClient = await db.connect();
  try {
    await pgClient.query('BEGIN');
    const versionResult = await pgClient.query(
      `INSERT INTO timetable_versions (term_id,department_id,version_label,status,conflict_score,quality_pct,utilization_rate,version_number)
       VALUES ($1,$2,'Draft_v1','Draft',$3,$4,$5,1) RETURNING id`,
      [job.term_id, job.department_id, selected.conflict_score, selected.quality_pct, selected.utilization_rate]
    );
    const versionId = versionResult.rows[0].id;
    const entries = selected.entries;
    if (entries.length > 0) {
      const valuePlaceholders = entries.map((_, i) => {
        const base = i * 8;
        return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},1)`;
      }).join(',');
      const flatValues = entries.flatMap(e => [versionId, e.batch_id, e.subject_id, e.faculty_id, e.room_id, e.timeslot_id, e.day, e.is_lab_block]);
      await pgClient.query(
        `INSERT INTO timetable_entries (timetable_version_id,batch_id,subject_id,faculty_id,room_id,timeslot_id,day,is_lab_block,version_number) VALUES ${valuePlaceholders}`,
        flatValues
      );
    }
    await pgClient.query(`UPDATE scheduling_jobs SET status='applied', selected_option_index=$1, updated_at=NOW() WHERE id=$2`, [selected_option_index, job.id]);
    await pgClient.query('COMMIT');
    res.locals['resourceId'] = versionId;
    return res.status(200).json({ timetable_version_id: versionId });
  } catch (err) { await pgClient.query('ROLLBACK'); throw err; }
  finally { pgClient.release(); }
});

router.get('/:jobId/status', async (req, res) => {
  const result = await db.query(
    `SELECT id, status, error_detail, CASE WHEN solution_pool IS NOT NULL THEN jsonb_array_length(solution_pool) ELSE 0 END AS options_count
     FROM scheduling_jobs WHERE id=$1`, [req.params['jobId']]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Job not found' });
  return res.json(result.rows[0]);
});

module.exports = router;
