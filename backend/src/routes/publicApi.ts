import { Router, Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { db } from '../db/client';
import { redis } from '../redis/client';

const router = Router();

// API key authentication middleware
async function apiKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'API key required' });
    return;
  }

  const rawKey = authHeader.slice(7);
  const keyHash = createHash('sha256').update(rawKey).digest('hex');

  const result = await db.query(
    `SELECT * FROM api_keys WHERE key_hash=$1 AND is_active=TRUE`, [keyHash]
  );
  if (result.rowCount === 0) {
    res.status(401).json({ error: 'Invalid or inactive API key' });
    return;
  }

  (req as any).apiKey = result.rows[0];
  next();
}

// Redis sliding window rate limiter: 100 req/min per key
async function rateLimitByKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const key = `pubapi:rl:${(req as any).apiKey.id}`;
  const now = Date.now();
  const windowMs = 60 * 1000;
  const limit = (req as any).apiKey.rate_limit_per_min ?? 100;

  await redis.zremrangebyscore(key, 0, now - windowMs);
  const count = await redis.zcard(key);

  if (count >= limit) {
    res.status(429).json({ error: 'Rate limit exceeded' });
    return;
  }

  await redis.zadd(key, now, `${now}-${Math.random()}`);
  await redis.expire(key, 60);
  next();
}

// DPDP anonymization
function anonymize(row: any, hasConsent: boolean): any {
  if (hasConsent) return row;
  const out = { ...row };
  if (out.faculty_name) out.faculty_name = `Faculty_${out.faculty_id?.slice(0, 6) ?? '000'}`;
  if (out.full_name) out.full_name = `Faculty_${out.id?.slice(0, 6) ?? '000'}`;
  if (out.student_strength) {
    const s = parseInt(out.student_strength, 10);
    out.student_strength = `${Math.floor(s / 10) * 10 + 1}–${Math.floor(s / 10) * 10 + 10}`;
  }
  return out;
}

router.use(apiKeyAuth, rateLimitByKey);

// GET /api/v1/public/timetable/:batch_id
router.get('/timetable/:batch_id', async (req: Request, res: Response) => {
  const hasConsent = (req as any).apiKey.data_access_consent;
  const result = await db.query(
    `SELECT te.*, s.name AS subject_name, fp.full_name AS faculty_name,
       r.room_number, ts.label AS timeslot_label, ts.start_time, ts.end_time
     FROM timetable_entries te
     JOIN timetable_versions tv ON tv.id=te.timetable_version_id AND tv.status='Published'
     JOIN subjects s ON s.id=te.subject_id
     JOIN faculty_profiles fp ON fp.id=te.faculty_id
     JOIN rooms r ON r.id=te.room_id
     JOIN timeslots ts ON ts.id=te.timeslot_id
     WHERE te.batch_id=$1
     ORDER BY te.day, ts.start_time`,
    [req.params['batch_id']]
  );
  res.json(result.rows.map(r => anonymize(r, hasConsent)));
});

// GET /api/v1/public/timetable/faculty/:faculty_id
router.get('/timetable/faculty/:faculty_id', async (req: Request, res: Response) => {
  const hasConsent = (req as any).apiKey.data_access_consent;
  const result = await db.query(
    `SELECT te.*, s.name AS subject_name, b.section_label, b.academic_year,
       r.room_number, ts.label AS timeslot_label, ts.start_time, ts.end_time
     FROM timetable_entries te
     JOIN timetable_versions tv ON tv.id=te.timetable_version_id AND tv.status='Published'
     JOIN subjects s ON s.id=te.subject_id
     JOIN batches b ON b.id=te.batch_id
     JOIN rooms r ON r.id=te.room_id
     JOIN timeslots ts ON ts.id=te.timeslot_id
     WHERE te.faculty_id=$1
     ORDER BY te.day, ts.start_time`,
    [req.params['faculty_id']]
  );
  res.json(result.rows.map(r => anonymize(r, hasConsent)));
});

// GET /api/v1/public/rooms/available
router.get('/rooms/available', async (req: Request, res: Response) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date is required' });

  const result = await db.query(
    `SELECT r.id, r.room_number, r.room_type, r.capacity, r.building
     FROM rooms r
     WHERE r.is_active=TRUE
       AND NOT EXISTS (
         SELECT 1 FROM room_bookings rb WHERE rb.room_id=r.id AND rb.booking_date=$1::date
       )
     ORDER BY r.building, r.room_number`,
    [date]
  );
  res.json(result.rows);
});

// GET /api/v1/public/faculty/:faculty_id/leave
router.get('/faculty/:faculty_id/leave', async (req: Request, res: Response) => {
  const result = await db.query(
    `SELECT date_start, date_end, leave_type FROM faculty_leaves
     WHERE faculty_id=$1 AND status='Approved'
     ORDER BY date_start`,
    [req.params['faculty_id']]
  );
  res.json(result.rows);
});

export default router;
