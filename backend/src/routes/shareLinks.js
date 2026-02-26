const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const { db } = require('../db/client');
const { authenticate, requireRole } = require('../middleware');

const router = Router();

router.post('/', authenticate, requireRole('Department_Admin', 'Super_Admin'), async (req, res) => {
  const { entity_type, entity_id, short_lived } = req.body;
  if (!entity_type || !entity_id) return res.status(400).json({ error: 'entity_type and entity_id are required' });
  if (!['batch', 'faculty'].includes(entity_type)) return res.status(400).json({ error: 'entity_type must be "batch" or "faculty"' });
  const token = uuidv4();
  const expiresAt = short_lived ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;
  await db.query(`INSERT INTO public_share_links (token,entity_type,entity_id,expires_at,is_active) VALUES ($1,$2,$3,$4,TRUE)`,
    [token, entity_type, entity_id, expiresAt]);
  const publicUrl = `${process.env['PUBLIC_BASE_URL'] ?? 'http://localhost:5173'}/public/timetable/${token}`;
  const qrDataUrl = await QRCode.toDataURL(publicUrl);
  res.status(201).json({ token, url: publicUrl, qr_code: qrDataUrl, expires_at: expiresAt });
});

router.get('/', authenticate, requireRole('Department_Admin', 'Super_Admin'), async (_req, res) => {
  const result = await db.query(`SELECT id,token,entity_type,entity_id,expires_at,is_active,created_at FROM public_share_links ORDER BY created_at DESC`);
  res.json(result.rows);
});

router.delete('/:token', authenticate, requireRole('Department_Admin', 'Super_Admin'), async (req, res) => {
  const result = await db.query(`UPDATE public_share_links SET is_active=FALSE WHERE token=$1 RETURNING id`, [req.params['token']]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Link not found' });
  res.status(204).send();
});

router.post('/:token/regenerate', authenticate, requireRole('Department_Admin', 'Super_Admin'), async (req, res) => {
  const old = await db.query(`UPDATE public_share_links SET is_active=FALSE WHERE token=$1 AND is_active=TRUE RETURNING entity_type, entity_id`, [req.params['token']]);
  if (old.rowCount === 0) return res.status(404).json({ error: 'Active link not found' });
  const { entity_type, entity_id } = old.rows[0];
  const newToken = uuidv4();
  await db.query(`INSERT INTO public_share_links (token,entity_type,entity_id,is_active) VALUES ($1,$2,$3,TRUE)`, [newToken, entity_type, entity_id]);
  const publicUrl = `${process.env['PUBLIC_BASE_URL'] ?? 'http://localhost:5173'}/public/timetable/${newToken}`;
  const qrDataUrl = await QRCode.toDataURL(publicUrl);
  res.json({ token: newToken, url: publicUrl, qr_code: qrDataUrl });
});

router.get('/resolve/:token', async (req, res) => {
  const link = await db.query(
    `SELECT * FROM public_share_links WHERE token=$1 AND is_active=TRUE AND (expires_at IS NULL OR expires_at > NOW())`, [req.params['token']]
  );
  if (link.rowCount === 0) return res.status(404).json({ error: 'Link not found or expired' });
  const { entity_type, entity_id } = link.rows[0];
  let result;
  if (entity_type === 'batch') {
    result = await db.query(
      `SELECT te.day, ts.label AS timeslot, s.name AS subject, r.room_number
       FROM timetable_entries te JOIN timetable_versions tv ON tv.id=te.timetable_version_id AND tv.status='Published'
       JOIN timeslots ts ON ts.id=te.timeslot_id JOIN subjects s ON s.id=te.subject_id JOIN rooms r ON r.id=te.room_id
       WHERE te.batch_id=$1 ORDER BY te.day, ts.start_time`, [entity_id]
    );
  } else {
    result = await db.query(
      `SELECT te.day, ts.label AS timeslot, s.name AS subject, b.section_label, r.room_number
       FROM timetable_entries te JOIN timetable_versions tv ON tv.id=te.timetable_version_id AND tv.status='Published'
       JOIN timeslots ts ON ts.id=te.timeslot_id JOIN subjects s ON s.id=te.subject_id
       JOIN batches b ON b.id=te.batch_id JOIN rooms r ON r.id=te.room_id
       WHERE te.faculty_id=$1 ORDER BY te.day, ts.start_time`, [entity_id]
    );
  }
  res.json({ entity_type, entity_id, entries: result.rows });
});

module.exports = router;
