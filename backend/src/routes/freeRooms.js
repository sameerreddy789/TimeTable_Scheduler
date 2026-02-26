const { Router } = require('express');
const { z } = require('zod');
const { db } = require('../db/client');
const { authenticate } = require('../middleware');

const router = Router();
router.use(authenticate);

router.get('/available', async (req, res) => {
  const { date, timeslot_ids } = req.query;
  if (!date) return res.status(400).json({ error: 'date is required' });
  const tsIds = Array.isArray(timeslot_ids) ? timeslot_ids : timeslot_ids ? [timeslot_ids] : [];
  const result = await db.query(
    `SELECT r.id, r.room_number, r.room_type, r.capacity, r.building FROM rooms r
     WHERE r.is_active=TRUE
       AND NOT EXISTS (SELECT 1 FROM room_bookings rb WHERE rb.room_id=r.id AND rb.booking_date=$1::date AND ($2::uuid[] IS NULL OR rb.timeslot_id=ANY($2::uuid[])))
       AND NOT EXISTS (SELECT 1 FROM timetable_entries te JOIN timetable_versions tv ON tv.id=te.timetable_version_id
         WHERE te.room_id=r.id AND tv.status='Published' AND ($2::uuid[] IS NULL OR te.timeslot_id=ANY($2::uuid[])))
     ORDER BY r.building, r.room_number`,
    [date, tsIds.length > 0 ? tsIds : null]
  );
  res.json(result.rows);
});

router.post('/book', async (req, res) => {
  const bookSchema = z.object({
    room_id: z.string().uuid(), booking_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    timeslot_id: z.string().uuid(), label: z.string().optional(),
  });
  const parsed = bookSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  const { room_id, booking_date, timeslot_id, label } = parsed.data;
  const user = req.user;
  const clash = await db.query(`SELECT 1 FROM room_bookings WHERE room_id=$1 AND booking_date=$2 AND timeslot_id=$3 LIMIT 1`, [room_id, booking_date, timeslot_id]);
  if ((clash.rowCount??0) > 0) return res.status(409).json({ error: 'Room is already booked for this timeslot' });
  const result = await db.query(
    `INSERT INTO room_bookings (room_id,booked_by,booking_date,timeslot_id,label) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [room_id, user.sub, booking_date, timeslot_id, label??null]
  );
  res.locals['resourceId'] = result.rows[0].id;
  return res.status(201).json(result.rows[0]);
});

router.get('/heatmap', async (req, res) => {
  const result = await db.query(
    `SELECT r.building, te.timeslot_id, te.day, COUNT(te.id) AS occupied_rooms,
       COUNT(DISTINCT r.id) AS total_rooms,
       ROUND(COUNT(te.id)::numeric / NULLIF(COUNT(DISTINCT r.id), 0) * 100, 2) AS utilization_pct
     FROM rooms r LEFT JOIN timetable_entries te ON te.room_id=r.id
     JOIN timetable_versions tv ON tv.id=te.timetable_version_id AND tv.status='Published'
     WHERE r.is_active=TRUE GROUP BY r.building, te.timeslot_id, te.day ORDER BY r.building, te.day, te.timeslot_id`
  );
  res.json(result.rows);
});

module.exports = router;
