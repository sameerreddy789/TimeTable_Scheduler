const { createHmac, randomBytes } = require('crypto');

const CSRF_SECRET = process.env['CSRF_SECRET'] ?? 'change-me-in-production';
const CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function httpsRedirect(req, res, next) {
  if (process.env['NODE_ENV'] === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
    res.redirect(301, `https://${req.headers.host}${req.url}`);
    return;
  }
  next();
}

function generateCsrfToken() {
  const nonce = randomBytes(16).toString('hex');
  const sig = createHmac('sha256', CSRF_SECRET).update(nonce).digest('hex');
  return `${nonce}.${sig}`;
}

function csrfProtection(req, res, next) {
  if (CSRF_SAFE_METHODS.has(req.method)) { next(); return; }
  if (req.path.startsWith('/api/v1/public')) { next(); return; }

  const headerToken = req.headers['x-csrf-token'];
  const cookieToken = req.cookies?.['csrf_token'];

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

function sanitizeValue(val) {
  if (typeof val === 'string') {
    return val
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  }
  if (Array.isArray(val)) return val.map(sanitizeValue);
  if (val && typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = sanitizeValue(v);
    }
    return out;
  }
  return val;
}

function sanitizeInputs(req, _res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body);
  }
  next();
}

function issueCsrfToken(req, res) {
  const token = generateCsrfToken();
  res.cookie('csrf_token', token, {
    httpOnly: false,
    sameSite: 'strict',
    secure: process.env['NODE_ENV'] === 'production',
  });
  res.json({ csrf_token: token });
}

module.exports = { httpsRedirect, csrfProtection, sanitizeInputs, issueCsrfToken, generateCsrfToken };
