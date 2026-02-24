import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client';
import { signToken, verifyToken, denylistToken } from './jwt';
import { loginRateLimiter } from '../middleware/rateLimiter';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const COOKIE_NAME = 'token';
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env['NODE_ENV'] === 'production',
  maxAge: 8 * 60 * 60 * 1000, // 8 hours in ms
};

const ACCOUNT_LOCK_THRESHOLD = 10;

// POST /auth/login
router.post('/login', loginRateLimiter, async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
  }

  const { email, password } = parsed.data;

  try {
    const result = await db.query(
      'SELECT id, email, role, password_hash, is_active, failed_login_count, locked_until FROM users WHERE email = $1',
      [email]
    );

    const user = result.rows[0];

    // Check account lock before verifying password
    if (user && user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(401).json({ error: 'Account temporarily locked. Try again later.' });
    }

    // Always run bcrypt compare to prevent timing attacks
    const dummyHash = '$2b$12$invalidhashfortimingprotection000000000000000000000000';
    const hashToCompare = user ? user.password_hash : dummyHash;
    const passwordMatch = await bcrypt.compare(password, hashToCompare);

    if (!user || !passwordMatch || !user.is_active) {
      // Increment failed_login_count and potentially lock the account
      if (user && user.is_active) {
        const newCount = (user.failed_login_count ?? 0) + 1;
        if (newCount >= ACCOUNT_LOCK_THRESHOLD) {
          await db.query(
            `UPDATE users
             SET failed_login_count = $1,
                 locked_until = NOW() + INTERVAL '15 minutes',
                 updated_at = NOW()
             WHERE id = $2`,
            [newCount, user.id]
          );
        } else {
          await db.query(
            `UPDATE users
             SET failed_login_count = $1,
                 updated_at = NOW()
             WHERE id = $2`,
            [newCount, user.id]
          );
        }
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Successful login — reset failed_login_count and locked_until
    await db.query(
      `UPDATE users
       SET failed_login_count = 0,
           locked_until = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [user.id]
    );

    const jti = uuidv4();
    const token = signToken({
      jti,
      sub: user.id,
      role: user.role,
      email: user.email,
    });

    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/logout
router.post('/logout', async (req: Request, res: Response) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return res.status(200).json({ message: 'Logged out' });
  }

  try {
    const payload = verifyToken(token);
    await denylistToken(payload.jti, payload.exp);
  } catch {
    // Token invalid or expired — still clear the cookie
  }

  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'strict', secure: COOKIE_OPTIONS.secure });
  return res.status(200).json({ message: 'Logged out' });
});

export default router;
