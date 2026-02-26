const { Router } = require('express');
const { z } = require('zod');
const { db } = require('../db/client');
const { authenticate, requireRole } = require('../middleware');

const router = Router();
router.use(authenticate, requireRole('Super_Admin', 'Department_Admin'));

const groupSchema = z.object({
  term_id: z.string().uuid(), subject_id: z.string().uuid(),
  batch_ids: z.array(z.string().uuid()).min(2),
});

router.get('/', async (req, res) => {
  const result = await db.query(
    `SELECT psg.*, json_agg(psm.batch_id) AS batch_ids FROM parallel_section_groups psg
     JOIN parallel_section_members psm ON psm.group_id=psg.id
     ${req.query['term_id'] ? 'WHERE psg.term_id=$1' : ''} GROUP BY psg.id`,
    req.query['term_id'] ? [req.query['term_id']] : []
  );
  res.json(result.rows);
});

router.post('/', async (req, res) => {
  const parsed = groupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const group = await client.query(
      `INSERT INTO parallel_section_groups (term_id,subject_id) VALUES ($1,$2) RETURNING *`,
      [parsed.data.term_id, parsed.data.subject_id]
    );
    for (const batchId of parsed.data.batch_ids) {
      await client.query(`INSERT INTO parallel_section_members (group_id,batch_id) VALUES ($1,$2)`, [group.rows[0].id, batchId]);
    }
    await client.query('COMMIT');
    res.locals['resourceId'] = group.rows[0].id;
    return res.status(201).json({ ...group.rows[0], batch_ids: parsed.data.batch_ids });
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
});

router.delete('/:id', async (req, res) => {
  const result = await db.query('DELETE FROM parallel_section_groups WHERE id=$1 RETURNING id', [req.params['id']]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Group not found' });
  res.locals['resourceId'] = req.params['id'];
  return res.status(204).send();
});

module.exports = router;
