const { Router } = require('express');
const { z } = require('zod');
const { db } = require('../db/client');
const { authenticate, requireRole } = require('../middleware');

const router = Router();
router.use(authenticate);

const ACADEMIC_YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year', 'PG Year 1', 'PG Year 2'];
const batchSchema = z.object({
  department_id: z.string().uuid(),
  academic_year: z.enum(ACADEMIC_YEARS),
  section_label: z.string().min(1),
  student_strength: z.number().int().positive(),
  max_weekly_classes: z.number().int().positive().optional(),
});

router.get('/', async (req, res) => {
  const user = req.user;
  const deptId = user.role === 'Department_Admin' ? user.department_id : req.query['department_id'];
  const result = await db.query(
    `SELECT b.*, d.name AS department_name, d.code AS department_code
     FROM batches b JOIN departments d ON d.id=b.department_id
     ${deptId ? 'WHERE b.department_id=$1' : ''} ORDER BY d.code, b.academic_year, b.section_label`,
    deptId ? [deptId] : []
  );
  res.json(result.rows);
});

router.post('/', requireRole('Super_Admin', 'Department_Admin'), async (req, res) => {
  const parsed = batchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  const user = req.user;
  if (user.role === 'Department_Admin' && parsed.data.department_id !== user.department_id) {
    return res.status(403).json({ error: 'Cannot create batch in another department' });
  }
  try {
    const result = await db.query(
      `INSERT INTO batches (department_id, academic_year, section_label, student_strength, max_weekly_classes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [parsed.data.department_id, parsed.data.academic_year, parsed.data.section_label,
       parsed.data.student_strength, parsed.data.max_weekly_classes ?? null]
    );
    res.locals['resourceId'] = result.rows[0].id;
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Batch already exists' });
    throw err;
  }
});

router.patch('/:id', requireRole('Super_Admin', 'Department_Admin'), async (req, res) => {
  const parsed = batchSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  const { department_id, academic_year, section_label, student_strength, max_weekly_classes } = parsed.data;
  const result = await db.query(
    `UPDATE batches SET department_id=COALESCE($1,department_id), academic_year=COALESCE($2,academic_year),
     section_label=COALESCE($3,section_label), student_strength=COALESCE($4,student_strength),
     max_weekly_classes=COALESCE($5,max_weekly_classes) WHERE id=$6 RETURNING *`,
    [department_id??null, academic_year??null, section_label??null, student_strength??null, max_weekly_classes??null, req.params['id']]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Batch not found' });
  res.locals['resourceId'] = req.params['id'];
  return res.json(result.rows[0]);
});

module.exports = router;
