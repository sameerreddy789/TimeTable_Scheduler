require('dotenv/config');

function required(key) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

const config = {
  DATABASE_URL: required('DATABASE_URL'),
  REDIS_URL: required('REDIS_URL'),
  JWT_SECRET: required('JWT_SECRET'),
  SENTRY_DSN: process.env['SENTRY_DSN'] ?? '',
  PYTHON_SCHEDULER_URL: process.env['PYTHON_SCHEDULER_URL'] ?? 'http://localhost:8000',
  PORT: parseInt(process.env['PORT'] ?? '3000', 10),
};

module.exports = { config };
