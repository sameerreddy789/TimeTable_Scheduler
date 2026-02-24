import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/client';
import { authenticate, requireRole } from '../middleware';
import { getIO } from '../socket';

const router = Router();
router.use(authenticate);

const leaveSchema = z.object({
  faculty_id: z.string().uuid(),
  term_id: z.string().uuid(),
  date_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  leave_type: z.enum(['Sick', 'Casual', 'Official']),
});

// POST /api/faculty-leave — record leave and get replacement suggestions
router.post('/', requireRole('Super_Admin', 'Department_Admin'), async (req: Request, res: Response) => {
  const parsed = leaveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });

  const d = parsed.data;

  // Record leave
  const leaveResult = await db.query(
    `INSERT INTO faculty_leaves (faculty_id, term_id, date_start, date_end, leave_type)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [d.faculty_id, d.term_id, d.date_start, d.date_end, d.leave_type]
  );

  // Find affected classes on leave dates
  const affected = await db.query(
    `SELECT te.*, s.name AS subject_name, s.id AS subject_id,
       ts.label AS timeslot_label, ts.id AS timeslot_id
     FROM timetable_entries te
     JOIN timetable_versions tv ON tv.id = te.timetable_version_id
     JOIN subjects s ON s.id = te.subject_id
     JOIN timeslots ts ON ts.id = te.timeslot_id
     WHERE te.faculty_id = $1
       AND tv.status = 'Published'
       AND te.day = ANY(
         SELECT to_char(generate_series($2::date, $3::date, '1 day'), 'Dy')
       )`,
    [d.faculty_id, d.date_start, d.date_end]
  );

  if (affected.rowCount === 0) {
    return res.status(201).json({ leave: leaveResult.rows[0], affected_classes: [], suggestions: [] });
  }

  // Find replacement suggestions ranked by: expertise → daily load → substitution count → availability
  const suggestions = await db.query(
    `SELECT fp.id, fp.full_name, fp.max_classes_per_day,
       EXISTS(
         SELECT 1 FROM subject_assignments sa2
         WHERE sa2.faculty_id=fp.id AND sa2.subject_id=ANY($1::uuid[])
       ) AS expertise_match,
       COALESCE((
         SELECT COUNT(*) FROM timetable_entries te2
         JOIN timetable_versions tv2 ON tv2.id=te2.timetable_version_id
         WHERE te2.faculty_id=fp.id AND tv2.status='Published'
           AND te2.day = $3
       ), 0) AS current_daily_load,
       COALESCE((
         SELECT COUNT(*) FROM audit_logs al
         WHERE al.user_id=(SELECT user_id FROM faculty_profiles WHERE id=fp.id)
           AND al.action='substitution' AND al.resource_type='faculty_leave'
       ), 0) AS substitution_count
     FROM faculty_profiles fp
     WHERE fp.id <> $2
       AND fp.max_classes_per_day > (
         SELECT COUNT(*) FROM timetable_entries te3
         JOIN timetable_versions tv3 ON tv3.id=te3.timetable_version_id
         WHERE te3.faculty_id=fp.id AND tv3.status='Published' AND te3.day=$3
       )
     ORDER BY expertise_match DESC, current_daily_load ASC, substitution_count ASC
     LIMIT 5`,
    [
      affected.rows.map((r: any) => r.subject_id),
      d.faculty_id,
      new Date(d.date_start).toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3),
    ]
  );

  return res.status(201).json({
    leave: leaveResult.rows[0],
    affected_classes: affected.rows,
    suggestions: suggestions.rows,
  });
});

// POST /api/faculty-leave/:leaveId/apply-substitution
router.post('/:leaveId/apply-substitution', requireRole('Super_Admin', 'Department_Admin'), async (req: Request, res: Response) => {
  const { entry_id, replacement_faculty_id } = req.body;
  if (!entry_id || !replacement_faculty_id) {
    return res.status(400).json({ error: 'entry_id and replacement_faculty_id are required' });
  }

  const result = await db.query(
    `UPDATE timetable_entries SET faculty_id=$1, version_number=version_number+1
     WHERE id=$2 RETURNING *`,
    [replacement_faculty_id, entry_id]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Entry not found' });

  // Notify replacement faculty
  const faculty = await db.query(
    `SELECT user_id FROM faculty_profiles WHERE id=$1`, [replacement_faculty_id]
  );
  if (faculty.rows[0]?.user_id) {
    await db.query(
      `INSERT INTO notifications (user_id, type, payload) VALUES ($1,'substitution_assigned',$2)`,
      [faculty.rows[0].user_id, JSON.stringify({ entry_id, leave_id: req.params['leaveId'] })]
    );
    getIO().to(`user:${faculty.rows[0].user_id}`).emit('notification', { type: 'substitution_assigned' });
  }

  res.locals['resourceId'] = entry_id;
  return res.json(result.rows[0]);
});

export default router;
