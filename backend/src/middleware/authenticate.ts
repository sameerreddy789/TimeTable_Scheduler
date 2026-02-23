import { Request, Response, NextFunction } from 'express';
import { verifyToken, isTokenDenylisted } from '../auth/jwt';

declare global {
  namespace Express {
    interface Request {
      user: {
        id: string;
        role: string;
        email: string;
      };
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token: string | undefined = req.cookies?.token;

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const payload = verifyToken(token);

    const denylisted = await isTokenDenylisted(payload.jti);
    if (denylisted) {
      res.status(401).json({ error: 'Invalid or expired session' });
      return;
    }

    req.user = {
      id: payload.sub,
      role: payload.role,
      email: payload.email,
    };

    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}
