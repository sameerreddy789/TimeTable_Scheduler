const rateLimit = require('express-rate-limit');
const { redis } = require('../redis/client');

const WINDOW_SECONDS = 15 * 60;
const MAX_ATTEMPTS = 5;

const redisStore = {
  async increment(key) {
    const redisKey = `ratelimit:${key}`;
    const hits = await redis.incr(redisKey);
    if (hits === 1) {
      await redis.expire(redisKey, WINDOW_SECONDS);
    }
    const ttl = await redis.ttl(redisKey);
    const resetTime = new Date(Date.now() + ttl * 1000);
    return { totalHits: hits, resetTime };
  },

  async decrement(key) {
    const redisKey = `ratelimit:${key}`;
    await redis.decr(redisKey);
  },

  async resetKey(key) {
    await redis.del(`ratelimit:${key}`);
  },
};

const loginRateLimiter = rateLimit({
  windowMs: WINDOW_SECONDS * 1000,
  max: MAX_ATTEMPTS,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore,
  skipSuccessfulRequests: true,
  handler: (_req, res) => {
    res.status(429).json({ error: 'Too many login attempts. Try again in 15 minutes.' });
  },
});

module.exports = { loginRateLimiter };
