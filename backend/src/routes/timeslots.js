const { Router } = require('express');
const { z } = require('zod');
const { db } = require('../db/client');
const { authenticate, requireRole } = require('../middleware');

const router = Router();
router.use(authenticate);

const timeslotSchema = z.object({
  label: z.string().min(1),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  shift: z.enum(['Morning', 'Evening']),
  is_break: z.boolean().optional().default(false),
  is_lab_block_start: z.boolean().optional().default(false),
  lab_block_partner_id: z.string().uuid().optional().nullable(),
});

router.get('/', async (_req, res) => {
  const result = await db.query(`SELECT * FROM timeslots ORDER BY shift, start_time`);
  res.json(result.rows);
});

router.post('/', requireRole('Super_Admin'), async (req, res) => {
  const parsed = timeslotSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  const d = parsed.data;
  const result = await db.query(
    `INSERT INTO timeslots (label,start_time,end_time,shift,is_break,is_lab_block_start,lab_block_partner_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [d.label, d.start_time, d.end_time, d.shift, d.is_break, d.is_lab_block_start, d.lab_block_partner_id??null]
  );
  res.locals['resourceId'] = result.rows[0].id;
  return res.status(201).json(result.rows[0]);
});

router.patch('/:id', requireRole('Super_Admin'), async (req, res) => {
  const inUse = await db.query(
    `SELECT 1 FROM timetable_entries te JOIN timetable_versions tv ON tv.id=te.timetable_version_id
     WHERE te.timeslot_id=$1 AND tv.status IN ('Draft','Pending_Approval','Published') LIMIT 1`, [req.params['id']]
  );
  if ((inUse.rowCount??0) > 0) return res.status(409).json({ error: 'Cannot modify timeslot: active timetable assignments exist' });
  const parsed = timeslotSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  const fields = parsed.data;
  const setClauses = []; const values = []; let idx = 1;
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) { setClauses.push(`${k} = $${idx++}`); values.push(v); }
  }
  if (setClauses.length === 0) return res.status(400).json({ error: 'No fields to update' });
  values.push(req.params['id']);
  const result = await db.query(`UPDATE timeslots SET ${setClauses.join(', ')} WHERE id=$${idx} RETURNING *`, values);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Timeslot not found' });
  res.locals['resourceId'] = req.params['id'];
  return res.json(result.rows[0]);
});

router.delete('/:id', requireRole('Super_Admin'), async (req, res) => {
  const inUse = await db.query(
    `SELECT 1 FROM timetable_entries te JOIN timetable_versions tv ON tv.id=te.timetable_version_id
     WHERE te.timeslot_id=$1 AND tv.status IN ('Draft','Pending_Approval','Published') LIMIT 1`, [req.params['id']]
  );
  if ((inUse.rowCount??0) > 0) return res.status(409).json({ error: 'Cannot delete timeslot: active timetable assignments exist' });
  const result = await db.query('DELETE FROM timeslots WHERE id=$1 RETURNING id', [req.params['id']]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Timeslot not found' });
  res.locals['resourceId'] = req.params['id'];
  return res.status(204).send();
});

module.exports = router;
