const { Router } = require('express');
const { db } = require('../db/client');
const { authenticate, requireRole } = require('../middleware');

const router = Router();
router.use(authenticate, requireRole('Super_Admin', 'Department_Admin'));

const STEPS = [
  { step: 1, key: 'departments', label: 'Create Departments', table: 'departments' },
  { step: 2, key: 'rooms', label: 'Create Rooms', table: 'rooms' },
  { step: 3, key: 'timeslots', label: 'Create Timeslots', table: 'timeslots' },
  { step: 4, key: 'faculty', label: 'Create Faculty Profiles', table: 'faculty_profiles' },
  { step: 5, key: 'batches', label: 'Create Batches', table: 'batches' },
  { step: 6, key: 'subjects', label: 'Create Subjects', table: 'subjects' },
  { step: 7, key: 'subject_assignments', label: 'Assign Subjects to Batches', table: 'subject_assignments' },
  { step: 8, key: 'scheduler', label: 'Run Scheduler', table: null },
];

async function checkStepComplete(step, termId) {
  if (!step.table) {
    const r = await db.query(`SELECT 1 FROM scheduling_jobs WHERE term_id=$1 AND status='completed' LIMIT 1`, [termId]);
    return (r.rowCount ?? 0) > 0;
  }
  const r = await db.query(`SELECT 1 FROM ${step.table} LIMIT 1`);
  return (r.rowCount ?? 0) > 0;
}

router.get('/:term_id', async (req, res) => {
  const { term_id } = req.params;
  const saved = await db.query(`SELECT step_key, status, completed_at FROM wizard_progress WHERE term_id=$1`, [term_id]);
  const savedMap = {};
  for (const row of saved.rows) savedMap[row.step_key] = row;
  const steps = await Promise.all(STEPS.map(async (s) => {
    const persisted = savedMap[s.key];
    const liveComplete = await checkStepComplete(s, term_id);
    const status = liveComplete ? 'complete' : (persisted?.status ?? 'pending');
    return { step: s.step, key: s.key, label: s.label, status, completed_at: persisted?.completed_at ?? null };
  }));
  const currentStep = steps.find(s => s.status !== 'complete')?.step ?? 8;
  res.json({ term_id, current_step: currentStep, steps });
});

router.post('/:term_id/step/:step_key/complete', async (req, res) => {
  const { term_id, step_key } = req.params;
  const step = STEPS.find(s => s.key === step_key);
  if (!step) return res.status(404).json({ error: 'Unknown step key' });
  if (step_key === 'subject_assignments') {
    const count = await db.query(`SELECT COUNT(*) FROM subject_assignments`);
    if (parseInt(count.rows[0].count, 10) === 0) {
      return res.status(422).json({ error: 'Pre-validation failed: no subject assignments found', config_url: '/api/subject-assignments' });
    }
  }
  await db.query(
    `INSERT INTO wizard_progress (term_id,step_key,status,completed_at) VALUES ($1,$2,'complete',NOW())
     ON CONFLICT (term_id,step_key) DO UPDATE SET status='complete', completed_at=NOW()`, [term_id, step_key]
  );
  res.json({ term_id, step_key, status: 'complete' });
});

router.post('/:term_id/reset', async (req, res) => {
  await db.query(`DELETE FROM wizard_progress WHERE term_id=$1`, [req.params['term_id']]);
  res.json({ message: 'Wizard progress reset' });
});

module.exports = router;
