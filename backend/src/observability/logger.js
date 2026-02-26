const pino = require('pino');

const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  base: { service: 'timetable-backend' },
});

module.exports = { logger };
