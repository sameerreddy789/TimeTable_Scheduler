import os from 'os';
import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../redis/client';

const connection = redis;

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000,
  },
};

export const schedulingQueue = new Queue('scheduling', {
  connection,
  defaultJobOptions,
});

export const dlqQueue = new Queue('scheduling:dlq', { connection });

export const schedulingWorker = new Worker(
  'scheduling',
  async (job: Job) => {
    console.log(`Processing job ${job.id}`);
    throw new Error('Not implemented');
  },
  {
    connection,
    concurrency: os.cpus().length,
  }
);

schedulingWorker.on('failed', async (job: Job | undefined, err: Error) => {
  if (!job) return;
  const isExhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
  if (isExhausted) {
    await dlqQueue.add('failed-job', { jobId: job.id, data: job.data, error: err.message });
  }
});
