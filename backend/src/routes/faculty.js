const { Router } = require('express');
const { z } = require('zod');
const { db } = require('../db/client');
const { authenticate, requireRole } = require('../middleware');

const router = Router();
router.use(authenticate);

const facultySchema = z.object({
  user_id: z.string().uuid().optional().nullable(),
  full_name: z.string().min(1),
  primary_department_id: z.string().uuid(),
  max_classes_per_day: z.number().int().positive(),
  max_classes_per_week: z.number().int().positive(),
  avg_leave_days_per_month: z.number().optional().nullable(),
  consecutive_class_limit: z.number().int().positive().default(2),
  secondary_depts: z.array(z.object({ department_id: z.string().uuid(), workload_pct: z.number().positive().max(100) })).optional().default([]),
  preferred_timeslots: z.array(z.string().uuid()).optional().default([]),
  not_available_timeslots: z.array(z.string().uuid()).optional().default([]),
});

router.get('/', async (req, res) => {
  const user = req.user;
  const deptId = user.role === 'Department_Admin' ? user.department_id : req.query['department_id'];
  const result = await db.query(
    `SELECT fp.*,
       COALESCE(json_agg(DISTINCT jsonb_build_object('department_id', fsd.department_id, 'workload_pct', fsd.workload_pct))
         FILTER (WHERE fsd.department_id IS NOT NULL), '[]') AS secondary_depts,
       COALESCE(json_agg(DISTINCT jsonb_build_object('timeslot_id', ftp.timeslot_id, 'pref_type', ftp.pref_type))
         FILTER (WHERE ftp.timeslot_id IS NOT NULL), '[]') AS timeslot_prefs
     FROM faculty_profiles fp LEFT JOIN faculty_secondary_depts fsd ON fsd.faculty_id=fp.id
     LEFT JOIN faculty_timeslot_prefs ftp ON ftp.faculty_id=fp.id
     ${deptId ? 'WHERE fp.primary_department_id=$1' : ''} GROUP BY fp.id ORDER BY fp.full_name`,
    deptId ? [deptId] : []
  );
  res.json(result.rows);
});

router.post('/', requireRole('Super_Admin', 'Department_Admin'), async (req, res) => {
  const parsed = facultySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  const d = parsed.data;
  const timeslotCount = await db.query(`SELECT COUNT(*) AS cnt FROM timeslots WHERE is_break=FALSE`);
  const totalSlots = parseInt(timeslotCount.rows[0].cnt, 10);
  if (d.max_classes_per_day > totalSlots) {
    return res.status(400).json({ error: `max_classes_per_day (${d.max_classes_per_day}) exceeds total non-break timeslots (${totalSlots})` });
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO faculty_profiles (user_id,full_name,primary_department_id,max_classes_per_day,max_classes_per_week,avg_leave_days_per_month,consecutive_class_limit)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [d.user_id??null, d.full_name, d.primary_department_id, d.max_classes_per_day, d.max_classes_per_week, d.avg_leave_days_per_month??null, d.consecutive_class_limit]
    );
    const faculty = result.rows[0];
    for (const sd of d.secondary_depts) {
      await client.query(`INSERT INTO faculty_secondary_depts (faculty_id,department_id,workload_pct) VALUES ($1,$2,$3)`, [faculty.id, sd.department_id, sd.workload_pct]);
    }
    for (const tsId of d.preferred_timeslots) {
      await client.query(`INSERT INTO faculty_timeslot_prefs (faculty_id,timeslot_id,pref_type) VALUES ($1,$2,'preferred')`, [faculty.id, tsId]);
    }
    for (const tsId of d.not_available_timeslots) {
      await client.query(`INSERT INTO faculty_timeslot_prefs (faculty_id,timeslot_id,pref_type) VALUES ($1,$2,'not_available')`, [faculty.id, tsId]);
    }
    await client.query('COMMIT');
    res.locals['resourceId'] = faculty.id;
    return res.status(201).json(faculty);
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
});

router.patch('/:id', requireRole('Super_Admin', 'Department_Admin'), async (req, res) => {
  const parsed = facultySchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  const { secondary_depts, preferred_timeslots, not_available_timeslots, ...fields } = parsed.data;
  const setClauses = []; const values = []; let idx = 1;
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) { setClauses.push(`${k} = $${idx++}`); values.push(v); }
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    if (setClauses.length > 0) {
      values.push(req.params['id']);
      const result = await client.query(`UPDATE faculty_profiles SET ${setClauses.join(', ')} WHERE id=$${idx} RETURNING *`, values);
      if (result.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Faculty not found' }); }
    }
    if (secondary_depts !== undefined) {
      await client.query('DELETE FROM faculty_secondary_depts WHERE faculty_id=$1', [req.params['id']]);
      for (const sd of secondary_depts) {
        await client.query(`INSERT INTO faculty_secondary_depts (faculty_id,department_id,workload_pct) VALUES ($1,$2,$3)`, [req.params['id'], sd.department_id, sd.workload_pct]);
      }
    }
    if (preferred_timeslots !== undefined || not_available_timeslots !== undefined) {
      await client.query('DELETE FROM faculty_timeslot_prefs WHERE faculty_id=$1', [req.params['id']]);
      for (const tsId of preferred_timeslots ?? []) {
        await client.query(`INSERT INTO faculty_timeslot_prefs (faculty_id,timeslot_id,pref_type) VALUES ($1,$2,'preferred')`, [req.params['id'], tsId]);
      }
      for (const tsId of not_available_timeslots ?? []) {
        await client.query(`INSERT INTO faculty_timeslot_prefs (faculty_id,timeslot_id,pref_type) VALUES ($1,$2,'not_available')`, [req.params['id'], tsId]);
      }
    }
    await client.query('COMMIT');
    res.locals['resourceId'] = req.params['id'];
    return res.status(200).json({ message: 'Faculty updated' });
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
});

module.exports = router;
