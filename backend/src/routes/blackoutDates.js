const { Router } = require('express');
const { z } = require('zod');
const { db } = require('../db/client');
const { authenticate, requireRole } = require('../middleware');

const router = Router();
router.use(authenticate);

const blackoutSchema = z.object({
  term_id: z.string().uuid(),
  date_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label: z.string().min(1),
  scope: z.enum(['institution', 'department']),
  department_id: z.string().uuid().optional().nullable(),
});

router.get('/', async (req, res) => {
  const result = await db.query(
    `SELECT * FROM blackout_dates ${req.query['term_id'] ? 'WHERE term_id=$1' : ''} ORDER BY date_start`,
    req.query['term_id'] ? [req.query['term_id']] : []
  );
  res.json(result.rows);
});

router.post('/', requireRole('Super_Admin'), async (req, res) => {
  const parsed = blackoutSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  const d = parsed.data;
  if (d.scope === 'department' && !d.department_id) return res.status(400).json({ error: 'department_id required for department-scoped blackout' });
  const result = await db.query(
    `INSERT INTO blackout_dates (term_id,date_start,date_end,label,scope,department_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [d.term_id, d.date_start, d.date_end, d.label, d.scope, d.department_id??null]
  );
  res.locals['resourceId'] = result.rows[0].id;
  return res.status(201).json(result.rows[0]);
});

router.patch('/:id', requireRole('Super_Admin'), async (req, res) => {
  const parsed = blackoutSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  const d = parsed.data;
  const result = await db.query(
    `UPDATE blackout_dates SET date_start=COALESCE($1,date_start), date_end=COALESCE($2,date_end),
     label=COALESCE($3,label), scope=COALESCE($4,scope), department_id=COALESCE($5,department_id)
     WHERE id=$6 RETURNING *`,
    [d.date_start??null, d.date_end??null, d.label??null, d.scope??null, d.department_id??null, req.params['id']]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Blackout date not found' });
  res.locals['resourceId'] = req.params['id'];
  return res.json(result.rows[0]);
});

router.delete('/:id', requireRole('Super_Admin'), async (req, res) => {
  const result = await db.query('DELETE FROM blackout_dates WHERE id=$1 RETURNING id', [req.params['id']]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Blackout date not found' });
  res.locals['resourceId'] = req.params['id'];
  return res.status(204).send();
});

module.exports = router;
