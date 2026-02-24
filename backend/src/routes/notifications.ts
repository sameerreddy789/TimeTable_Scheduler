import { Router, Request, Response } from 'express';
import { db } from '../db/client';
import { authenticate } from '../middleware';

const router = Router();
router.use(authenticate);

// GET /api/notifications — current user's notifications
router.get('/', async (req: Request, res: Response) => {
  const user = (req as any).user;
  const result = await db.query(
    `SELECT * FROM notifications
     WHERE user_id=$1
       AND created_at >= NOW() - INTERVAL '90 days'
     ORDER BY created_at DESC`,
    [user.sub]
  );
  res.json(result.rows);
});

// GET /api/notifications/unread-count
router.get('/unread-count', async (req: Request, res: Response) => {
  const user = (req as any).user;
  const result = await db.query(
    `SELECT COUNT(*) AS count FROM notifications WHERE user_id=$1 AND is_read=FALSE`,
    [user.sub]
  );
  res.json({ count: parseInt(result.rows[0].count, 10) });
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', async (req: Request, res: Response) => {
  const user = (req as any).user;
  await db.query(
    `UPDATE notifications SET is_read=TRUE WHERE id=$1 AND user_id=$2`,
    [req.params['id'], user.sub]
  );
  res.status(204).send();
});

// PATCH /api/notifications/read-all
router.patch('/read-all', async (req: Request, res: Response) => {
  const user = (req as any).user;
  await db.query(`UPDATE notifications SET is_read=TRUE WHERE user_id=$1`, [user.sub]);
  res.status(204).send();
});

// GET /api/notifications/preferences
router.get('/preferences', async (req: Request, res: Response) => {
  const user = (req as any).user;
  const result = await db.query(
    `SELECT * FROM notification_preferences WHERE user_id=$1`, [user.sub]
  );
  res.json(result.rows);
});

// PUT /api/notifications/preferences
router.put('/preferences', async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { notification_type, email_enabled } = req.body;
  if (!notification_type) return res.status(400).json({ error: 'notification_type is required' });

  await db.query(
    `INSERT INTO notification_preferences (user_id, notification_type, email_enabled)
     VALUES ($1,$2,$3)
     ON CONFLICT (user_id, notification_type) DO UPDATE SET email_enabled=$3`,
    [user.sub, notification_type, email_enabled ?? true]
  );
  res.status(204).send();
});

export default router;
