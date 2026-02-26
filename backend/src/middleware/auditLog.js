const { db } = require('../db/client');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function auditLogMiddleware(req, res, next) {
  if (!MUTATING_METHODS.has(req.method)) {
    return next();
  }

  res.on('finish', () => {
    const user = req.user;
    if (!user || res.statusCode >= 400) return;

    const resourceType = deriveResourceType(req.path);
    const resourceId = deriveResourceId(req.path, res);

    db.query(
      `INSERT INTO audit_logs (user_id, role, action, resource_type, resource_id, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        user.sub,
        user.role,
        req.method,
        resourceType,
        resourceId ?? null,
        JSON.stringify({
          path: req.path,
          status: res.statusCode,
          correlation_id: req.correlationId ?? null,
        }),
      ]
    ).catch((err) => {
      console.error('[audit] failed to write audit log:', err.message);
    });
  });

  next();
}

function deriveResourceType(path) {
  const segments = path.replace(/^\/api\//, '').split('/').filter(Boolean);
  return segments[0] ?? 'unknown';
}

function deriveResourceId(path, res) {
  if (res.locals['resourceId']) return res.locals['resourceId'];
  const segments = path.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return last && uuidRegex.test(last) ? last : null;
}

module.exports = { auditLogMiddleware };
