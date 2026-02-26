const { Router } = require('express');
const bcrypt = require('bcrypt');
const { z } = require('zod');
const { db } = require('../db/client');
const { authenticate, requireRole } = require('../middleware');

const router = Router();
router.use(authenticate, requireRole('Super_Admin'));

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['Super_Admin', 'Department_Admin', 'Faculty', 'Authority']),
  department_id: z.string().uuid().optional(),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  role: z.enum(['Super_Admin', 'Department_Admin', 'Faculty', 'Authority']).optional(),
  department_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional(),
});

router.get('/', async (_req, res) => {
  const result = await db.query(
    `SELECT id, email, role, department_id, is_active, created_at FROM users ORDER BY created_at DESC`
  );
  res.json(result.rows);
});

router.post('/', async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  const { email, password, role, department_id } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const result = await db.query(
      `INSERT INTO users (email, password_hash, role, department_id) VALUES ($1,$2,$3,$4)
       RETURNING id, email, role, department_id, is_active, created_at`,
      [email, passwordHash, role, department_id ?? null]
    );
    res.locals['resourceId'] = result.rows[0].id;
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    throw err;
  }
});

router.patch('/:id', async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  const { email, role, department_id, is_active } = parsed.data;
  const fields = [];
  const values = [];
  let idx = 1;
  if (email !== undefined) { fields.push(`email = $${idx++}`); values.push(email); }
  if (role !== undefined) { fields.push(`role = $${idx++}`); values.push(role); }
  if (department_id !== undefined) { fields.push(`department_id = $${idx++}`); values.push(department_id); }
  if (is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(is_active); }
  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
  fields.push(`updated_at = NOW()`);
  values.push(req.params['id']);
  const result = await db.query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, email, role, department_id, is_active`,
    values
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });
  res.locals['resourceId'] = req.params['id'];
  return res.json(result.rows[0]);
});

router.delete('/:id', async (req, res) => {
  const result = await db.query(
    `UPDATE users SET is_active=FALSE, updated_at=NOW() WHERE id=$1 RETURNING id`, [req.params['id']]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });
  res.locals['resourceId'] = req.params['id'];
  return res.status(204).send();
});

module.exports = router;
