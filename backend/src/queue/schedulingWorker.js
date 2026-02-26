const os = require('os');
const axios = require('axios');
const { Worker } = require('bullmq');
const { redis } = require('../redis/client');
const { db } = require('../db/client');
const { config } = require('../config');
const { logger } = require('../observability/logger');
const { dlqQueue } = require('./schedulingQueue');
const { getIO } = require('../socket');

const schedulingWorker = new Worker(
  'scheduling',
  async (job) => {
    const { job_id, correlation_id, requested_by_user_id } = job.data;
    const log = logger.child({ job_id, correlation_id });

    log.info('Scheduling job started');

    await db.query(
      `UPDATE scheduling_jobs SET status='running', updated_at=NOW() WHERE id=$1`,
      [job_id]
    );

    const response = await axios.post(
      `${config.PYTHON_SCHEDULER_URL}/solve`,
      job.data,
      {
        headers: { 'X-Correlation-ID': correlation_id, 'Content-Type': 'application/json' },
        timeout: (job.data.timeout_seconds + 10) * 1000,
      }
    );

    const solveResult = response.data;

    if (solveResult.status === 'infeasible') {
      await db.query(
        `UPDATE scheduling_jobs SET status='failed', error_detail=$1, updated_at=NOW() WHERE id=$2`,
        [JSON.stringify({ infeasibility_report: solveResult.infeasibility_report }), job_id]
      );
      getIO().to(`user:${requested_by_user_id}`).emit('scheduling:failed', {
        job_id, reason: 'infeasible', report: solveResult.infeasibility_report,
      });
      return;
    }

    await db.query(
      `UPDATE scheduling_jobs SET status='completed', solution_pool=$1, updated_at=NOW() WHERE id=$2`,
      [JSON.stringify(solveResult.options), job_id]
    );

    log.info({ options_count: solveResult.options.length }, 'Solution pool staged');

    getIO().to(`user:${requested_by_user_id}`).emit('scheduling:complete', {
      job_id,
      options_count: solveResult.options.length,
      options_summary: solveResult.options.map((o) => ({
        seed: o.seed,
        conflict_score: o.conflict_score,
        quality_pct: o.quality_pct,
        utilization_rate: o.utilization_rate,
        entry_count: o.entries.length,
      })),
    });
  },
  { connection: redis, concurrency: os.cpus().length }
);

schedulingWorker.on('failed', async (job, err) => {
  if (!job) return;
  const isExhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
  if (!isExhausted) return;

  logger.error({ job_id: job.data.job_id, error: err.message }, 'Scheduling job exhausted retries → DLQ');

  await db.query(
    `UPDATE scheduling_jobs SET status='failed', error_detail=$1, updated_at=NOW() WHERE id=$2`,
    [JSON.stringify({ error: err.message }), job.data.job_id]
  ).catch(() => {});

  await dlqQueue.add('failed-job', {
    job_id: job.data.job_id,
    correlation_id: job.data.correlation_id,
    error: err.message,
    requested_by_user_id: job.data.requested_by_user_id,
  });

  getIO().to(`user:${job.data.requested_by_user_id}`).emit('scheduling:failed', {
    job_id: job.data.job_id, reason: 'error', error: err.message,
  });
});

module.exports = { schedulingWorker };
