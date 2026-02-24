import { Request, Response, NextFunction } from 'express';
import { createHmac, randomBytes } from 'crypto';

const CSRF_SECRET = process.env['CSRF_SECRET'] ?? 'change-me-in-production';
const CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// HTTPS redirect — only active in production
export function httpsRedirect(req: Request, res: Response, next: NextFunction): void {
  if (process.env['NODE_ENV'] === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
    res.redirect(301, `https://${req.headers.host}${req.url}`);
    return;
  }
  next();
}

// Generate a CSRF token (double-submit cookie pattern)
export function generateCsrfToken(): string {
  const nonce = randomBytes(16).toString('hex');
  const sig = createHmac('sha256', CSRF_SECRET).update(nonce).digest('hex');
  return `${nonce}.${sig}`;
}

// Validate CSRF token from header against cookie
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (CSRF_SAFE_METHODS.has(req.method)) { next(); return; }

  // Skip for public API (uses API key auth, not cookies)
  if (req.path.startsWith('/api/v1/public')) { next(); return; }

  const headerToken = req.headers['x-csrf-token'] as string | undefined;
  const cookieToken = req.cookies?.['csrf_token'] as string | undefined;

  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    res.status(403).json({ error: 'CSRF token mismatch' });
    return;
  }

  const [nonce, sig] = headerToken.split('.');
  if (!nonce || !sig) { res.status(403).json({ error: 'Invalid CSRF token format' }); return; }

  const expected = createHmac('sha256', CSRF_SECRET).update(nonce).digest('hex');
  if (sig !== expected) { res.status(403).json({ error: 'CSRF token signature invalid' }); return; }

  next();
}

// Input sanitization — strip common XSS vectors from string fields
function sanitizeValue(val: unknown): unknown {
  if (typeof val === 'string') {
    return val
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  }
  if (Array.isArray(val)) return val.map(sanitizeValue);
  if (val && typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = sanitizeValue(v);
    }
    return out;
  }
  return val;
}

export function sanitizeInputs(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body);
  }
  next();
}

// Issue CSRF cookie on GET /auth/csrf-token
export function issueCsrfToken(req: Request, res: Response): void {
  const token = generateCsrfToken();
  res.cookie('csrf_token', token, {
    httpOnly: false, // must be readable by JS to set header
    sameSite: 'strict',
    secure: process.env['NODE_ENV'] === 'production',
  });
  res.json({ csrf_token: token });
}
