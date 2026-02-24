import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { redis } from '../redis/client';

const WINDOW_SECONDS = 15 * 60; // 15 minutes
const MAX_ATTEMPTS = 5;

/**
 * Simple Redis-backed store for express-rate-limit.
 * Tracks `ratelimit:{ip}` keys with a 15-minute TTL.
 */
const redisStore = {
  async increment(key: string): Promise<{ totalHits: number; resetTime: Date }> {
    const redisKey = `ratelimit:${key}`;
    const hits = await redis.incr(redisKey);
    if (hits === 1) {
      // First hit — set TTL
      await redis.expire(redisKey, WINDOW_SECONDS);
    }
    const ttl = await redis.ttl(redisKey);
    const resetTime = new Date(Date.now() + ttl * 1000);
    return { totalHits: hits, resetTime };
  },

  async decrement(key: string): Promise<void> {
    const redisKey = `ratelimit:${key}`;
    await redis.decr(redisKey);
  },

  async resetKey(key: string): Promise<void> {
    await redis.del(`ratelimit:${key}`);
  },
};

export const loginRateLimiter = rateLimit({
  windowMs: WINDOW_SECONDS * 1000,
  max: MAX_ATTEMPTS,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore,
  skipSuccessfulRequests: true, // only count failed attempts
  handler: (_req: Request, res: Response) => {
    res.status(429).json({ error: 'Too many login attempts. Try again in 15 minutes.' });
  },
});
