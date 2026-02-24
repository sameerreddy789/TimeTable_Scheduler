import { Router, Request, Response } from 'express';
import { db } from '../db/client';
import { authenticate, requireRole } from '../middleware';

const router = Router();
router.use(authenticate, requireRole('Super_Admin', 'Department_Admin'));

/**
 * Wizard steps:
 * 1. Create Departments
 * 2. Create Rooms
 * 3. Create Timeslots
 * 4. Create Faculty Profiles
 * 5. Create Batches
 * 6. Create Subjects
 * 7. Create Subject Assignments  ← triggers pre-validation
 * 8. Run Scheduler
 */
const STEPS = [
  { step: 1, key: 'departments',          label: 'Create Departments',        table: 'departments' },
  { step: 2, key: 'rooms',                label: 'Create Rooms',              table: 'rooms' },
  { step: 3, key: 'timeslots',            label: 'Create Timeslots',          table: 'timeslots' },
  { step: 4, key: 'faculty',              label: 'Create Faculty Profiles',   table: 'faculty_profiles' },
  { step: 5, key: 'batches',              label: 'Create Batches',            table: 'batches' },
  { step: 6, key: 'subjects',             label: 'Create Subjects',           table: 'subjects' },
  { step: 7, key: 'subject_assignments',  label: 'Assign Subjects to Batches', table: 'subject_assignments' },
  { step: 8, key: 'scheduler',            label: 'Run Scheduler',             table: null },
];

async function checkStepComplete(step: typeof STEPS[0], termId: string): Promise<boolean> {
  if (!step.table) {
    // Step 8: check if any scheduling_jobs exist for this term
    const r = await db.query(
      `SELECT 1 FROM scheduling_jobs WHERE term_id=$1 AND status='completed' LIMIT 1`, [termId]
    );
    return (r.rowCount ?? 0) > 0;
  }
  const r = await db.query(`SELECT 1 FROM ${step.table} LIMIT 1`);
  return (r.rowCount ?? 0) > 0;
}

// GET /api/wizard/:term_id — get full wizard status
router.get('/:term_id', async (req: Request, res: Response) => {
  const { term_id } = req.params;

  // Load persisted progress
  const saved = await db.query(
    `SELECT step_key, status, completed_at FROM wizard_progress WHERE term_id=$1`, [term_id]
  );
  const savedMap: Record<string, { status: string; completed_at: string | null }> = {};
  for (const row of saved.rows) savedMap[row.step_key] = row;

  const steps = await Promise.all(STEPS.map(async (s) => {
    const persisted = savedMap[s.key];
    const liveComplete = await checkStepComplete(s, term_id);
    const status = liveComplete ? 'complete' : (persisted?.status ?? 'pending');
    return {
      step: s.step,
      key: s.key,
      label: s.label,
      status,
      completed_at: persisted?.completed_at ?? null,
    };
  }));

  const currentStep = steps.find(s => s.status !== 'complete')?.step ?? 8;
  res.json({ term_id, current_step: currentStep, steps });
});

// POST /api/wizard/:term_id/step/:step_key/complete — mark a step complete
router.post('/:term_id/step/:step_key/complete', async (req: Request, res: Response) => {
  const { term_id, step_key } = req.params;
  const step = STEPS.find(s => s.key === step_key);
  if (!step) return res.status(404).json({ error: 'Unknown step key' });

  // Step 7 triggers pre-validation before marking complete
  if (step_key === 'subject_assignments') {
    const validationResult = await db.query(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN passed THEN 1 ELSE 0 END) AS passed
       FROM (
         SELECT TRUE AS passed FROM subject_assignments LIMIT 1
       ) sub`
    );
    // Simplified: just check assignments exist; real pre-validation is at POST /schedule/validate
    const count = await db.query(`SELECT COUNT(*) FROM subject_assignments`);
    if (parseInt(count.rows[0].count, 10) === 0) {
      return res.status(422).json({
        error: 'Pre-validation failed: no subject assignments found',
        config_url: '/api/subject-assignments',
      });
    }
  }

  await db.query(
    `INSERT INTO wizard_progress (term_id, step_key, status, completed_at)
     VALUES ($1,$2,'complete',NOW())
     ON CONFLICT (term_id, step_key) DO UPDATE SET status='complete', completed_at=NOW()`,
    [term_id, step_key]
  );

  res.json({ term_id, step_key, status: 'complete' });
});

// POST /api/wizard/:term_id/reset — reset wizard progress for a term
router.post('/:term_id/reset', async (req: Request, res: Response) => {
  await db.query(`DELETE FROM wizard_progress WHERE term_id=$1`, [req.params['term_id']]);
  res.json({ message: 'Wizard progress reset' });
});

export default router;
