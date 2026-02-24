import { Request, Response, NextFunction } from 'express';
import { db } from '../db/client';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Post-handler middleware that writes an audit_log entry for every
 * mutating request (POST/PUT/PATCH/DELETE) made by an authenticated user.
 * Attach after route handlers via `res.on('finish', ...)`.
 */
export function auditLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!MUTATING_METHODS.has(req.method)) {
    return next();
  }

  res.on('finish', () => {
    // Only log if the user is authenticated and the request succeeded (2xx/3xx)
    const user = (req as any).user;
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
          correlation_id: (req as any).correlationId ?? null,
        }),
      ]
    ).catch((err: Error) => {
      // Non-fatal — log but don't crash the request
      console.error('[audit] failed to write audit log:', err.message);
    });
  });

  next();
}

/** Derive a resource type label from the URL path, e.g. /api/rooms/123 → 'rooms' */
function deriveResourceType(path: string): string {
  const segments = path.replace(/^\/api\//, '').split('/').filter(Boolean);
  return segments[0] ?? 'unknown';
}

/** Try to extract a UUID resource ID from the response locals or URL path */
function deriveResourceId(path: string, res: Response): string | null {
  // Check if the route handler stored the created/affected resource ID
  if (res.locals['resourceId']) return res.locals['resourceId'];

  // Fall back to last path segment if it looks like a UUID
  const segments = path.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return last && uuidRegex.test(last) ? last : null;
}
