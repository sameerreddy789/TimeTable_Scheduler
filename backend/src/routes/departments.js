const { Router } = require('express');
const { z } = require('zod');
const { db } = require('../db/client');
const { authenticate, requireRole } = require('../middleware');

const router = Router();
router.use(authenticate);

const deptSchema = z.object({ name: z.string().min(1), code: z.string().min(1).max(20) });

router.get('/', async (_req, res) => {
  const result = await db.query('SELECT * FROM departments ORDER BY name');
  res.json(result.rows);
});

router.post('/', requireRole('Super_Admin'), async (req, res) => {
  const parsed = deptSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  try {
    const result = await db.query(
      'INSERT INTO departments (name, code) VALUES ($1, $2) RETURNING *',
      [parsed.data.name, parsed.data.code.toUpperCase()]
    );
    res.locals['resourceId'] = result.rows[0].id;
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Department code already exists' });
    throw err;
  }
});

router.patch('/:id', requireRole('Super_Admin'), async (req, res) => {
  const parsed = deptSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  const { name, code } = parsed.data;
  const result = await db.query(
    `UPDATE departments SET name=COALESCE($1,name), code=COALESCE($2,code) WHERE id=$3 RETURNING *`,
    [name ?? null, code?.toUpperCase() ?? null, req.params['id']]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Department not found' });
  res.locals['resourceId'] = req.params['id'];
  return res.json(result.rows[0]);
});

module.exports = router;
