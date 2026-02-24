import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/client';
import { authenticate, requireRole } from '../middleware';
import { getIO } from '../socket';
import { runPreValidation } from '../validation/preValidation';

const router = Router();
router.use(authenticate);

// GET /api/timetable?department_id=&term_id=&academic_year=&section_label=
router.get('/', async (req: Request, res: Response) => {
  const { department_id, term_id, academic_year, section_label } = req.query;
  const user = (req as any).user;
  const deptId = user.role === 'Department_Admin' ? user.department_id : department_id;

  const result = await db.query(
    `SELECT tv.*, d.name AS department_name
     FROM timetable_versions tv
     JOIN departments d ON d.id = tv.department_id
     WHERE ($1::uuid IS NULL OR tv.department_id = $1)
       AND ($2::uuid IS NULL OR tv.term_id = $2)
     ORDER BY tv.created_at DESC`,
    [deptId ?? null, term_id ?? null]
  );
  res.json(result.rows);
});

// GET /api/timetable/:id/entries — grid data
router.get('/:id/entries', async (req: Request, res: Response) => {
  const result = await db.query(
    `SELECT te.*,
       s.name AS subject_name, s.subject_type,
       fp.full_name AS faculty_name,
       r.room_number, r.building,
       b.section_label, b.academic_year,
       ts.label AS timeslot_label, ts.start_time, ts.end_time
     FROM timetable_entries te
     JOIN subjects s ON s.id = te.subject_id
     JOIN faculty_profiles fp ON fp.id = te.faculty_id
     JOIN rooms r ON r.id = te.room_id
     JOIN batches b ON b.id = te.batch_id
     JOIN timeslots ts ON ts.id = te.timeslot_id
     WHERE te.timetable_version_id = $1
     ORDER BY te.day, ts.start_time`,
    [req.params['id']]
  );
  res.json(result.rows);
});

// POST /api/timetable/:id/move — drag-drop with hard constraint re-validation
router.post('/:id/move', requireRole('Super_Admin', 'Department_Admin'), async (req: Request, res: Response) => {
  const moveSchema = z.object({
    assignment_id: z.string().uuid(),
    to_day: z.string(),
    to_timeslot_id: z.string().uuid(),
    to_room_id: z.string().uuid(),
    version: z.number().int(),
  });

  const parsed = moveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });

  const { assignment_id, to_day, to_timeslot_id, to_room_id, version } = parsed.data;

  // Optimistic lock check
  const entry = await db.query(
    `SELECT te.*, tv.status, tv.version_number AS tv_version
     FROM timetable_entries te
     JOIN timetable_versions tv ON tv.id = te.timetable_version_id
     WHERE te.id = $1`,
    [assignment_id]
  );
  if (entry.rowCount === 0) return res.status(404).json({ error: 'Entry not found' });

  const e = entry.rows[0];
  if (e.status === 'Published') return res.status(403).json({ error: 'Cannot edit a published timetable' });
  if (e.version_number !== version) {
    return res.status(409).json({
      error: 'Version conflict — another user has modified this entry',
      current_version: e.version_number,
    });
  }

  // Hard constraint checks for the new slot
  const conflicts: string[] = [];

  // Room clash
  const roomClash = await db.query(
    `SELECT 1 FROM timetable_entries
     WHERE timetable_version_id=$1 AND room_id=$2 AND timeslot_id=$3 AND day=$4 AND id<>$5 LIMIT 1`,
    [e.timetable_version_id, to_room_id, to_timeslot_id, to_day, assignment_id]
  );
  if ((roomClash.rowCount ?? 0) > 0) conflicts.push('Room is already occupied in this timeslot');

  // Faculty clash
  const facClash = await db.query(
    `SELECT 1 FROM timetable_entries
     WHERE timetable_version_id=$1 AND faculty_id=$2 AND timeslot_id=$3 AND day=$4 AND id<>$5 LIMIT 1`,
    [e.timetable_version_id, e.faculty_id, to_timeslot_id, to_day, assignment_id]
  );
  if ((facClash.rowCount ?? 0) > 0) conflicts.push('Faculty has another class in this timeslot');

  if (conflicts.length > 0) {
    // Generate swap suggestions (greedy: find nearest free slot)
    const suggestions = await generateSwapSuggestions(e, to_room_id, e.timetable_version_id);
    return res.status(409).json({
      error: 'Hard constraint violation',
      conflicts,
      suggestions,
    });
  }

  // Apply move
  await db.query(
    `UPDATE timetable_entries
     SET day=$1, timeslot_id=$2, room_id=$3, version_number=version_number+1
     WHERE id=$4`,
    [to_day, to_timeslot_id, to_room_id, assignment_id]
  );

  res.locals['resourceId'] = assignment_id;
  return res.json({ message: 'Entry moved', new_version: version + 1 });
});

async function generateSwapSuggestions(entry: any, targetRoomId: string, versionId: string) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const timeslots = await db.query(`SELECT id FROM timeslots WHERE is_break=FALSE ORDER BY start_time`);
  const suggestions: any[] = [];

  for (const day of days) {
    for (const ts of timeslots.rows) {
      if (suggestions.length >= 3) break;
      const clash = await db.query(
        `SELECT 1 FROM timetable_entries
         WHERE timetable_version_id=$1 AND (room_id=$2 OR faculty_id=$3) AND timeslot_id=$4 AND day=$5 LIMIT 1`,
        [versionId, targetRoomId, entry.faculty_id, ts.id, day]
      );
      if ((clash.rowCount ?? 0) === 0) {
        suggestions.push({ day, timeslot_id: ts.id, room_id: targetRoomId, conflict_score_delta: 0 });
      }
    }
    if (suggestions.length >= 3) break;
  }
  return suggestions;
}

// POST /api/timetable/:id/submit — submit for approval
router.post('/:id/submit', requireRole('Department_Admin'), async (req: Request, res: Response) => {
  const result = await db.query(
    `UPDATE timetable_versions SET status='Pending_Approval', submitted_by=$1, updated_at=NOW()
     WHERE id=$2 AND status='Draft' RETURNING *`,
    [(req as any).user.sub, req.params['id']]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Timetable not found or not in Draft status' });

  // Notify all Authority users
  const authorities = await db.query(`SELECT id FROM users WHERE role='Authority' AND is_active=TRUE`);
  for (const auth of authorities.rows) {
    await db.query(
      `INSERT INTO notifications (user_id, type, payload) VALUES ($1,'timetable_submitted',$2)`,
      [auth.id, JSON.stringify({ timetable_version_id: req.params['id'] })]
    );
    getIO().to(`user:${auth.id}`).emit('notification', { type: 'timetable_submitted' });
  }

  res.locals['resourceId'] = req.params['id'];
  return res.json(result.rows[0]);
});

// POST /api/timetable/:id/approve — Authority approves
router.post('/:id/approve', requireRole('Authority'), async (req: Request, res: Response) => {
  const result = await db.query(
    `UPDATE timetable_versions SET status='Published', reviewed_by=$1, updated_at=NOW()
     WHERE id=$2 AND status='Pending_Approval' RETURNING *`,
    [(req as any).user.sub, req.params['id']]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Timetable not found or not pending approval' });

  const tv = result.rows[0];
  if (tv.submitted_by) {
    await db.query(
      `INSERT INTO notifications (user_id, type, payload) VALUES ($1,'timetable_approved',$2)`,
      [tv.submitted_by, JSON.stringify({ timetable_version_id: req.params['id'] })]
    );
    getIO().to(`user:${tv.submitted_by}`).emit('notification', { type: 'timetable_approved' });
  }

  res.locals['resourceId'] = req.params['id'];
  return res.json(tv);
});

// POST /api/timetable/:id/reject — Authority rejects
router.post('/:id/reject', requireRole('Authority'), async (req: Request, res: Response) => {
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: 'Rejection reason is required' });

  const result = await db.query(
    `UPDATE timetable_versions SET status='Rejected', rejection_reason=$1, reviewed_by=$2, updated_at=NOW()
     WHERE id=$3 AND status='Pending_Approval' RETURNING *`,
    [reason, (req as any).user.sub, req.params['id']]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Timetable not found or not pending approval' });

  const tv = result.rows[0];
  if (tv.submitted_by) {
    await db.query(
      `INSERT INTO notifications (user_id, type, payload) VALUES ($1,'timetable_rejected',$2)`,
      [tv.submitted_by, JSON.stringify({ timetable_version_id: req.params['id'], reason })]
    );
    getIO().to(`user:${tv.submitted_by}`).emit('notification', { type: 'timetable_rejected', reason });
  }

  res.locals['resourceId'] = req.params['id'];
  return res.json(tv);
});

// POST /api/timetable/:id/rollover — copy published timetable as draft for new term
router.post('/:id/rollover', requireRole('Super_Admin', 'Department_Admin'), async (req: Request, res: Response) => {
  const { new_term_id } = req.body;
  if (!new_term_id) return res.status(400).json({ error: 'new_term_id is required' });

  const source = await db.query(
    `SELECT * FROM timetable_versions WHERE id=$1 AND status='Published'`,
    [req.params['id']]
  );
  if (source.rowCount === 0) return res.status(404).json({ error: 'Published timetable not found' });

  const src = source.rows[0];
  const pgClient = await db.connect();
  try {
    await pgClient.query('BEGIN');

    const newVersion = await pgClient.query(
      `INSERT INTO timetable_versions (term_id, department_id, version_label, status, version_number)
       VALUES ($1,$2,'Draft_v1','Draft',1) RETURNING id`,
      [new_term_id, src.department_id]
    );
    const newId = newVersion.rows[0].id;

    // Copy entries
    await pgClient.query(
      `INSERT INTO timetable_entries (timetable_version_id, batch_id, subject_id, faculty_id, room_id, timeslot_id, day, is_lab_block, version_number)
       SELECT $1, batch_id, subject_id, faculty_id, room_id, timeslot_id, day, is_lab_block, 1
       FROM timetable_entries WHERE timetable_version_id=$2`,
      [newId, req.params['id']]
    );

    await pgClient.query('COMMIT');

    // Run pre-validation on the copy to flag stale assignments
    const report = await runPreValidation(pgClient, new_term_id, src.department_id);

    res.locals['resourceId'] = newId;
    return res.status(201).json({ timetable_version_id: newId, validation_report: report });
  } catch (err) {
    await pgClient.query('ROLLBACK');
    throw err;
  } finally {
    pgClient.release();
  }
});

// GET /api/timetable/version-hash — returns SHA-256 of latest published timetable (task 11.1)
import { createHash } from 'crypto';
router.get('/version-hash', async (_req: Request, res: Response) => {
  const result = await db.query(
    `SELECT MAX(updated_at) AS last_updated FROM timetable_versions WHERE status='Published'`
  );
  const ts = result.rows[0]?.last_updated ?? new Date(0).toISOString();
  const hash = createHash('sha256').update(String(ts)).digest('hex');
  res.json({ hash, last_updated: ts });
});

export default router;
