import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/client';
import { authenticate, requireRole } from '../middleware';
import { runPreValidation } from '../validation/preValidation';

const router = Router();
router.use(authenticate, requireRole('Super_Admin', 'Department_Admin'));

const validateSchema = z.object({
  term_id: z.string().uuid(),
  department_id: z.string().uuid(),
});

// POST /api/schedule/validate — run pre-validation and return readiness report
router.post('/validate', async (req: Request, res: Response) => {
  const parsed = validateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });

  const client = await db.connect();
  try {
    const report = await runPreValidation(client, parsed.data.term_id, parsed.data.department_id);
    const status = report.score === 100 ? 200 : 422;
    return res.status(status).json(report);
  } finally {
    client.release();
  }
});

export default router;
