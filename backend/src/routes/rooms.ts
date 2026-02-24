import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/client';
import { authenticate, requireRole } from '../middleware';

const router = Router();
router.use(authenticate);

const VALID_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const roomSchema = z.object({
  room_number: z.string().min(1),
  room_type: z.enum(['Classroom', 'Lab', 'Seminar_Hall']),
  capacity: z.number().int().positive(),
  building: z.string().min(1),
  available_days: z.array(z.enum(VALID_DAYS)).min(1),
  features: z.array(z.string()).optional().default([]),
});

const updateRoomSchema = roomSchema.partial();

// GET /api/rooms
router.get('/', async (_req: Request, res: Response) => {
  const result = await db.query(
    `SELECT r.*, COALESCE(array_agg(rft.tag) FILTER (WHERE rft.tag IS NOT NULL), '{}') AS features
     FROM rooms r
     LEFT JOIN room_feature_tags rft ON rft.room_id = r.id
     WHERE r.is_active = TRUE
     GROUP BY r.id
     ORDER BY r.building, r.room_number`
  );
  res.json(result.rows);
});

// GET /api/rooms/summary — count by type
router.get('/summary', async (_req: Request, res: Response) => {
  const result = await db.query(
    `SELECT room_type, COUNT(*) AS count FROM rooms WHERE is_active = TRUE GROUP BY room_type`
  );
  res.json(result.rows);
});

// POST /api/rooms — Super_Admin only
router.post('/', requireRole('Super_Admin'), async (req: Request, res: Response) => {
  const parsed = roomSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  }
  const { room_number, room_type, capacity, building, available_days, features } = parsed.data;

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const roomResult = await client.query(
      `INSERT INTO rooms (room_number, room_type, capacity, building, available_days)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [room_number, room_type, capacity, building, available_days]
    );
    const room = roomResult.rows[0];

    if (features.length > 0) {
      const tagValues = features.map((_, i) => `($1, $${i + 2})`).join(', ');
      await client.query(
        `INSERT INTO room_feature_tags (room_id, tag) VALUES ${tagValues}`,
        [room.id, ...features]
      );
    }
    await client.query('COMMIT');
    res.locals['resourceId'] = room.id;
    return res.status(201).json({ ...room, features });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PATCH /api/rooms/:id — Super_Admin only
router.patch('/:id', requireRole('Super_Admin'), async (req: Request, res: Response) => {
  const parsed = updateRoomSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  }

  const { features, ...fields } = parsed.data;
  const setClauses: string[] = [];
  const values: any[] = [];
  let idx = 1;

  for (const [key, val] of Object.entries(fields)) {
    if (val !== undefined) { setClauses.push(`${key} = $${idx++}`); values.push(val); }
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    if (setClauses.length > 0) {
      values.push(req.params['id']);
      const result = await client.query(
        `UPDATE rooms SET ${setClauses.join(', ')} WHERE id = $${idx} AND is_active = TRUE RETURNING *`,
        values
      );
      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Room not found' });
      }
    }

    if (features !== undefined) {
      await client.query('DELETE FROM room_feature_tags WHERE room_id = $1', [req.params['id']]);
      if (features.length > 0) {
        const tagValues = features.map((_, i) => `($1, $${i + 2})`).join(', ');
        await client.query(
          `INSERT INTO room_feature_tags (room_id, tag) VALUES ${tagValues}`,
          [req.params['id'], ...features]
        );
      }
    }

    await client.query('COMMIT');
    res.locals['resourceId'] = req.params['id'];
    return res.status(200).json({ message: 'Room updated' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// DELETE /api/rooms/:id — deactivate, Super_Admin only
router.delete('/:id', requireRole('Super_Admin'), async (req: Request, res: Response) => {
  const result = await db.query(
    `UPDATE rooms SET is_active = FALSE WHERE id = $1 RETURNING id`,
    [req.params['id']]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Room not found' });
  res.locals['resourceId'] = req.params['id'];
  return res.status(204).send();
});

export default router;
