const { register, httpRequestCounter, httpRequestDuration } = require('./metrics');
const { initSentry } = require('./sentry');
const { logger } = require('./logger');

module.exports = { register, httpRequestCounter, httpRequestDuration, initSentry, logger };
