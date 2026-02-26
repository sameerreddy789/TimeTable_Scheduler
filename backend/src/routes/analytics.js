const { Router } = require('express');
const { db } = require('../db/client');
const { authenticate } = require('../middleware');

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const user = req.user;
  const termId = req.query['term_id'];
  const deptId = user.role === 'Department_Admin' ? user.department_id : req.query['department_id'];
  if (!termId) return res.status(400).json({ error: 'term_id is required' });

  const versionResult = await db.query(
    `SELECT id FROM timetable_versions WHERE term_id=$1 AND status='Published'
     AND ($2::uuid IS NULL OR department_id=$2) ORDER BY created_at DESC LIMIT 1`,
    [termId, deptId ?? null]
  );
  if (versionResult.rowCount === 0) return res.json({ message: 'No published timetable found', data: null });

  const versionId = versionResult.rows[0].id;
  const [roomUtil, facultyLoad, congestedDays, freePeriods] = await Promise.all([
    db.query(
      `SELECT r.id, r.room_number, r.building, r.room_type,
         COUNT(te.id) AS scheduled_slots,
         (SELECT COUNT(*) FROM timeslots WHERE is_break=FALSE) * 5 AS total_slots,
         ROUND(COUNT(te.id)::numeric / NULLIF((SELECT COUNT(*) FROM timeslots WHERE is_break=FALSE) * 5, 0) * 100, 2) AS utilization_pct
       FROM rooms r LEFT JOIN timetable_entries te ON te.room_id=r.id AND te.timetable_version_id=$1
       WHERE r.is_active=TRUE GROUP BY r.id ORDER BY utilization_pct DESC`, [versionId]),
    db.query(
      `SELECT fp.id, fp.full_name, fp.max_classes_per_week,
         COUNT(te.id) AS scheduled_classes,
         ROUND(COUNT(te.id)::numeric / NULLIF(fp.max_classes_per_week, 0) * 100, 2) AS load_pct
       FROM faculty_profiles fp LEFT JOIN timetable_entries te ON te.faculty_id=fp.id AND te.timetable_version_id=$1
       GROUP BY fp.id ORDER BY load_pct DESC`, [versionId]),
    db.query(
      `SELECT day, COUNT(*) AS simultaneous_classes FROM timetable_entries WHERE timetable_version_id=$1
       GROUP BY day ORDER BY simultaneous_classes DESC LIMIT 3`, [versionId]),
    db.query(
      `SELECT day,
         (SELECT COUNT(*) FROM timeslots WHERE is_break=FALSE) *
         (SELECT COUNT(DISTINCT batch_id) FROM timetable_entries WHERE timetable_version_id=$1) -
         COUNT(*) AS free_periods
       FROM timetable_entries WHERE timetable_version_id=$1 GROUP BY day ORDER BY day`, [versionId]),
  ]);

  return res.json({
    timetable_version_id: versionId,
    room_utilization: roomUtil.rows,
    faculty_load: facultyLoad.rows,
    top_congested_days: congestedDays.rows,
    free_periods_per_day: freePeriods.rows,
  });
});

module.exports = router;
