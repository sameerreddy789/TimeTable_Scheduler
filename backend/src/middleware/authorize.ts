import { Request, Response, NextFunction } from 'express';
import { logger } from '../observability/logger';

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userRole = req.user?.role;

    if (!userRole || !roles.includes(userRole)) {
      logger.warn({
        correlationId: req.correlationId,
        userId: req.user?.id,
        userRole,
        requiredRoles: roles,
        method: req.method,
        path: req.path,
      }, 'Unauthorized access attempt');

      res.status(403).json({ error: 'Forbidden', correlation_id: req.correlationId });
      return;
    }

    next();
  };
}
