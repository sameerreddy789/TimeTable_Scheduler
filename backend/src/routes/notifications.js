const { Router } = require('express');
const { db } = require('../db/client');
const { authenticate } = require('../middleware');

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const user = req.user;
  const result = await db.query(
    `SELECT * FROM notifications WHERE user_id=$1 AND created_at >= NOW() - INTERVAL '90 days' ORDER BY created_at DESC`,
    [user.sub]
  );
  res.json(result.rows);
});

router.get('/unread-count', async (req, res) => {
  const user = req.user;
  const result = await db.query(`SELECT COUNT(*) AS count FROM notifications WHERE user_id=$1 AND is_read=FALSE`, [user.sub]);
  res.json({ count: parseInt(result.rows[0].count, 10) });
});

router.patch('/:id/read', async (req, res) => {
  const user = req.user;
  await db.query(`UPDATE notifications SET is_read=TRUE WHERE id=$1 AND user_id=$2`, [req.params['id'], user.sub]);
  res.status(204).send();
});

router.patch('/read-all', async (req, res) => {
  const user = req.user;
  await db.query(`UPDATE notifications SET is_read=TRUE WHERE user_id=$1`, [user.sub]);
  res.status(204).send();
});

router.get('/preferences', async (req, res) => {
  const user = req.user;
  const result = await db.query(`SELECT * FROM notification_preferences WHERE user_id=$1`, [user.sub]);
  res.json(result.rows);
});

router.put('/preferences', async (req, res) => {
  const user = req.user;
  const { notification_type, email_enabled } = req.body;
  if (!notification_type) return res.status(400).json({ error: 'notification_type is required' });
  await db.query(
    `INSERT INTO notification_preferences (user_id, notification_type, email_enabled) VALUES ($1,$2,$3)
     ON CONFLICT (user_id, notification_type) DO UPDATE SET email_enabled=$3`,
    [user.sub, notification_type, email_enabled ?? true]
  );
  res.status(204).send();
});

module.exports = router;
