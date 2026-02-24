import os from 'os';
import axios from 'axios';
import { Worker, Job } from 'bullmq';
import { redis } from '../redis/client';
import { db } from '../db/client';
import { config } from '../config';
import { logger } from '../observability/logger';
import { dlqQueue } from './schedulingQueue';
import { getIO } from '../socket';

export interface SchedulingJobData {
  job_id: string;
  correlation_id: string;
  term_id: string;
  department_id: string;
  rooms: any[];
  faculty: any[];
  subjects: any[];
  batches: any[];
  assignments: any[];
  timeslots: any[];
  parallel_groups: any[];
  soft_weights: Record<string, number>;
  timeout_seconds: number;
  requested_by_user_id: string;
}

export const schedulingWorker = new Worker<SchedulingJobData>(
  'scheduling',
  async (job: Job<SchedulingJobData>) => {
    const { job_id, correlation_id, requested_by_user_id } = job.data;
    const log = logger.child({ job_id, correlation_id });

    log.info('Scheduling job started');

    // Mark job as running
    await db.query(
      `UPDATE scheduling_jobs SET status='running', updated_at=NOW() WHERE id=$1`,
      [job_id]
    );

    // Call Python solver
    const response = await axios.post(
      `${config.PYTHON_SCHEDULER_URL}/solve`,
      job.data,
      {
        headers: {
          'X-Correlation-ID': correlation_id,
          'Content-Type': 'application/json',
        },
        timeout: (job.data.timeout_seconds + 10) * 1000,
      }
    );

    const solveResult = response.data;

    if (solveResult.status === 'infeasible') {
      await db.query(
        `UPDATE scheduling_jobs SET status='failed', error_detail=$1, updated_at=NOW() WHERE id=$2`,
        [JSON.stringify({ infeasibility_report: solveResult.infeasibility_report }), job_id]
      );
      // Notify via WebSocket
      getIO().to(`user:${requested_by_user_id}`).emit('scheduling:failed', {
        job_id,
        reason: 'infeasible',
        report: solveResult.infeasibility_report,
      });
      return;
    }

    // Stage solution pool in scheduling_jobs (two-phase write — phase 1)
    await db.query(
      `UPDATE scheduling_jobs
       SET status='completed', solution_pool=$1, updated_at=NOW()
       WHERE id=$2`,
      [JSON.stringify(solveResult.options), job_id]
    );

    log.info({ options_count: solveResult.options.length }, 'Solution pool staged');

    // Notify Department Admin via WebSocket
    getIO().to(`user:${requested_by_user_id}`).emit('scheduling:complete', {
      job_id,
      options_count: solveResult.options.length,
      options_summary: solveResult.options.map((o: any) => ({
        seed: o.seed,
        conflict_score: o.conflict_score,
        quality_pct: o.quality_pct,
        utilization_rate: o.utilization_rate,
        entry_count: o.entries.length,
      })),
    });
  },
  {
    connection: redis,
    concurrency: os.cpus().length,
  }
);

schedulingWorker.on('failed', async (job: Job<SchedulingJobData> | undefined, err: Error) => {
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

  // Notify via WebSocket
  getIO().to(`user:${job.data.requested_by_user_id}`).emit('scheduling:failed', {
    job_id: job.data.job_id,
    reason: 'error',
    error: err.message,
  });
});
