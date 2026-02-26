const os = require('os');
const { Queue, Worker } = require('bullmq');
const { redis } = require('../redis/client');

const connection = redis;

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
};

const schedulingQueue = new Queue('scheduling', { connection, defaultJobOptions });
const dlqQueue = new Queue('scheduling:dlq', { connection });

const schedulingWorker = new Worker(
  'scheduling',
  async (job) => {
    console.log(`Processing job ${job.id}`);
    throw new Error('Not implemented');
  },
  { connection, concurrency: os.cpus().length }
);

schedulingWorker.on('failed', async (job, err) => {
  if (!job) return;
  const isExhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
  if (isExhausted) {
    await dlqQueue.add('failed-job', { jobId: job.id, data: job.data, error: err.message });
  }
});

module.exports = { schedulingQueue, schedulingWorker, dlqQueue };
