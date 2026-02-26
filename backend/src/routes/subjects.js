const { Router } = require('express');
const { z } = require('zod');
const { db } = require('../db/client');
const { authenticate, requireRole } = require('../middleware');

const router = Router();
router.use(authenticate);

const subjectSchema = z.object({
  department_id: z.string().uuid(),
  name: z.string().min(1),
  code: z.string().min(1),
  subject_type: z.enum(['Theory', 'Lab', 'Elective']),
  weekly_hours: z.number().int().positive(),
  classes_per_week: z.number().int().positive(),
  preferred_room_type: z.enum(['Classroom', 'Lab', 'Seminar_Hall']).optional().nullable(),
  required_room_features: z.array(z.string()).optional().default([]),
  fixed_timeslot_id: z.string().uuid().optional().nullable(),
  fixed_day: z.string().optional().nullable(),
  session_durations: z.array(z.number().int().positive()).min(1),
});

router.get('/', async (req, res) => {
  const user = req.user;
  const deptId = user.role === 'Department_Admin' ? user.department_id : req.query['department_id'];
  const result = await db.query(
    `SELECT s.*, sdr.session_durations FROM subjects s LEFT JOIN session_duration_rules sdr ON sdr.subject_id=s.id
     ${deptId ? 'WHERE s.department_id=$1' : ''} ORDER BY s.name`, deptId ? [deptId] : []
  );
  res.json(result.rows);
});

router.post('/', requireRole('Super_Admin', 'Department_Admin'), async (req, res) => {
  const parsed = subjectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  const d = parsed.data;
  const sessionSum = d.session_durations.reduce((a, b) => a + b, 0);
  if (sessionSum !== d.weekly_hours) {
    return res.status(400).json({ error: `weekly_hours (${d.weekly_hours}) must equal sum of session_durations (${sessionSum})` });
  }
  if (d.subject_type === 'Lab' && d.preferred_room_type !== 'Lab') {
    if (!req.body.confirm_lab_room_mismatch) {
      return res.status(422).json({ error: 'Lab subject should have preferred_room_type of Lab', code: 'LAB_ROOM_MISMATCH', requires_confirmation: true });
    }
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO subjects (department_id,name,code,subject_type,weekly_hours,classes_per_week,preferred_room_type,required_room_features,fixed_timeslot_id,fixed_day)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [d.department_id, d.name, d.code, d.subject_type, d.weekly_hours, d.classes_per_week,
       d.preferred_room_type??null, d.required_room_features, d.fixed_timeslot_id??null, d.fixed_day??null]
    );
    const subject = result.rows[0];
    await client.query(`INSERT INTO session_duration_rules (subject_id, session_durations) VALUES ($1,$2)`, [subject.id, d.session_durations]);
    await client.query('COMMIT');
    res.locals['resourceId'] = subject.id;
    return res.status(201).json({ ...subject, session_durations: d.session_durations });
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
});

router.delete('/:id', requireRole('Super_Admin', 'Department_Admin'), async (req, res) => {
  const inUse = await db.query(
    `SELECT 1 FROM timetable_entries te JOIN timetable_versions tv ON tv.id=te.timetable_version_id
     WHERE te.subject_id=$1 AND tv.status='Published' LIMIT 1`, [req.params['id']]
  );
  if ((inUse.rowCount??0) > 0) return res.status(409).json({ error: 'Cannot delete subject: referenced in a published timetable' });
  const result = await db.query('DELETE FROM subjects WHERE id=$1 RETURNING id', [req.params['id']]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Subject not found' });
  res.locals['resourceId'] = req.params['id'];
  return res.status(204).send();
});

module.exports = router;
