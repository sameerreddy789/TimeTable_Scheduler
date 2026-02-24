import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/client';
import { authenticate, requireRole } from '../middleware';

const router = Router();
router.use(authenticate, requireRole('Super_Admin', 'Department_Admin'));

const assignSchema = z.object({
  term_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  batch_id: z.string().uuid(),
  faculty_id: z.string().uuid(),
});

router.get('/', async (req: Request, res: Response) => {
  const { term_id, batch_id } = req.query;
  const result = await db.query(
    `SELECT sa.*, s.name AS subject_name, b.section_label, fp.full_name AS faculty_name
     FROM subject_assignments sa
     JOIN subjects s ON s.id = sa.subject_id
     JOIN batches b ON b.id = sa.batch_id
     JOIN faculty_profiles fp ON fp.id = sa.faculty_id
     WHERE ($1::uuid IS NULL OR sa.term_id = $1)
       AND ($2::uuid IS NULL OR sa.batch_id = $2)
     ORDER BY s.name`,
    [term_id ?? null, batch_id ?? null]
  );
  res.json(result.rows);
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });

  try {
    const result = await db.query(
      `INSERT INTO subject_assignments (term_id, subject_id, batch_id, faculty_id)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [parsed.data.term_id, parsed.data.subject_id, parsed.data.batch_id, parsed.data.faculty_id]
    );
    res.locals['resourceId'] = result.rows[0].id;
    return res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Assignment already exists for this term/subject/batch' });
    throw err;
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const result = await db.query('DELETE FROM subject_assignments WHERE id = $1 RETURNING id', [req.params['id']]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Assignment not found' });
  res.locals['resourceId'] = req.params['id'];
  return res.status(204).send();
});

export default router;
