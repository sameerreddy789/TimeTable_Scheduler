import jwt from 'jsonwebtoken';
import { config } from '../config';
import { redis } from '../redis/client';

export interface JwtPayload {
  jti: string;       // unique token ID (UUID v4)
  sub: string;       // user ID
  role: string;      // user role
  email: string;
  iat: number;
  exp: number;
}

const EXPIRY_SECONDS = 8 * 60 * 60; // 8 hours

export function signToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: EXPIRY_SECONDS,
  });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.JWT_SECRET) as JwtPayload;
}

export async function denylistToken(jti: string, expiresAt: number): Promise<void> {
  const ttl = expiresAt - Math.floor(Date.now() / 1000);
  if (ttl > 0) {
    await redis.set(`denylist:${jti}`, '1', 'EX', ttl);
  }
}

export async function isTokenDenylisted(jti: string): Promise<boolean> {
  const val = await redis.get(`denylist:${jti}`);
  return val !== null;
}
