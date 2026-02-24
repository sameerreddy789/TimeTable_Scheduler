import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/client';
import { authenticate, requireRole } from '../middleware';

const router = Router();
router.use(authenticate, requireRole('Super_Admin'));

const DEFAULT_WEIGHTS: Record<string, number> = {
  gap_minimization: 3,
  even_distribution: 5,
  room_distribution: 3,
  theory_clustering: 4,
  subject_day_spread: 4,
  consecutive_limit: 4,
  building_proximity: 2,
};

const weightSchema = z.object({
  constraint_key: z.string().min(1),
  weight: z.number().int().min(1).max(10),
});

// GET /api/soft-weights?term_id=
router.get('/', async (req: Request, res: Response) => {
  const { term_id } = req.query;
  if (!term_id) return res.status(400).json({ error: 'term_id is required' });

  const result = await db.query(
    `SELECT constraint_key, weight FROM soft_constraint_weights WHERE term_id=$1`, [term_id]
  );

  // Merge with defaults for any missing keys
  const stored: Record<string, number> = {};
  for (const row of result.rows) stored[row.constraint_key] = row.weight;
  const merged = { ...DEFAULT_WEIGHTS, ...stored };

  res.json(Object.entries(merged).map(([constraint_key, weight]) => ({ constraint_key, weight })));
});

// PUT /api/soft-weights — upsert a weight
router.put('/', async (req: Request, res: Response) => {
  const parsed = z.object({ term_id: z.string().uuid(), ...weightSchema.shape }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });

  const { term_id, constraint_key, weight } = parsed.data;
  await db.query(
    `INSERT INTO soft_constraint_weights (term_id, constraint_key, weight)
     VALUES ($1,$2,$3)
     ON CONFLICT (term_id, constraint_key) DO UPDATE SET weight=$3`,
    [term_id, constraint_key, weight]
  );
  res.status(204).send();
});

// POST /api/soft-weights/reset — reset all weights to defaults for a term
router.post('/reset', async (req: Request, res: Response) => {
  const { term_id } = req.body;
  if (!term_id) return res.status(400).json({ error: 'term_id is required' });

  await db.query(`DELETE FROM soft_constraint_weights WHERE term_id=$1`, [term_id]);
  res.json({ message: 'Weights reset to defaults', defaults: DEFAULT_WEIGHTS });
});

export default router;
