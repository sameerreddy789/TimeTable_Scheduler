import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/client';
import { authenticate, requireRole } from '../middleware';

const router = Router();
router.use(authenticate, requireRole('Super_Admin', 'Department_Admin'));

const groupSchema = z.object({
  term_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  batch_ids: z.array(z.string().uuid()).min(1),
});

router.get('/', async (req: Request, res: Response) => {
  const result = await db.query(
    `SELECT eg.*, json_agg(egb.batch_id) AS batch_ids,
       SUM(b.student_strength) AS combined_strength
     FROM elective_groups eg
     JOIN elective_group_batches egb ON egb.group_id = eg.id
     JOIN batches b ON b.id = egb.batch_id
     ${req.query['term_id'] ? 'WHERE eg.term_id = $1' : ''}
     GROUP BY eg.id`,
    req.query['term_id'] ? [req.query['term_id']] : []
  );
  res.json(result.rows);
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = groupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const group = await client.query(
      `INSERT INTO elective_groups (term_id, subject_id) VALUES ($1,$2) RETURNING *`,
      [parsed.data.term_id, parsed.data.subject_id]
    );
    for (const batchId of parsed.data.batch_ids) {
      await client.query(
        `INSERT INTO elective_group_batches (group_id, batch_id) VALUES ($1,$2)`,
        [group.rows[0].id, batchId]
      );
    }
    await client.query('COMMIT');
    res.locals['resourceId'] = group.rows[0].id;
    return res.status(201).json({ ...group.rows[0], batch_ids: parsed.data.batch_ids });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const result = await db.query('DELETE FROM elective_groups WHERE id = $1 RETURNING id', [req.params['id']]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Elective group not found' });
  res.locals['resourceId'] = req.params['id'];
  return res.status(204).send();
});

export default router;
