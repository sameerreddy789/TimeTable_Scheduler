const Sentry = require('@sentry/node');
const { config } = require('../config');

function initSentry() {
  if (config.SENTRY_DSN) {
    Sentry.init({ dsn: config.SENTRY_DSN, tracesSampleRate: 0.1 });
  }
}

module.exports = { initSentry };
