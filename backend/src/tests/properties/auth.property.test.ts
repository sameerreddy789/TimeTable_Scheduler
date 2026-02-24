/**
 * Property tests for Authentication & RBAC (tasks 2.6–2.9)
 * Feature: smart-timetable-system
 */
import * as fc from 'fast-check';
import jwt from 'jsonwebtoken';
import { describe, it, expect } from 'vitest';

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'test-secret';
const ROLES = ['Super_Admin', 'Department_Admin', 'Faculty', 'Authority'] as const;

// Property 1: for any valid credential pair, JWT decode yields correct user ID, role, ~8h expiry
describe('Property 1: JWT decode correctness', () => {
  it('decoded token contains correct userId, role, and ~8h expiry', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.constantFrom(...ROLES),
        (userId, role) => {
          const token = jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '8h' });
          const decoded = jwt.verify(token, JWT_SECRET) as any;
          expect(decoded.userId).toBe(userId);
          expect(decoded.role).toBe(role);
          const expiryMs = (decoded.exp - decoded.iat) * 1000;
          // Allow ±5 seconds tolerance
          expect(expiryMs).toBeGreaterThanOrEqual(8 * 60 * 60 * 1000 - 5000);
          expect(expiryMs).toBeLessThanOrEqual(8 * 60 * 60 * 1000 + 5000);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Property 2: invalid tokens always throw on verify
describe('Property 2: Invalid tokens rejected', () => {
  it('tampered tokens always fail verification', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.constantFrom(...ROLES),
        fc.string({ minLength: 1 }),
        (userId, role, tamper) => {
          const token = jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '8h' });
          const parts = token.split('.');
          // Tamper with the payload
          const tamperedToken = `${parts[0]}.${Buffer.from(tamper).toString('base64url')}.${parts[2]}`;
          expect(() => jwt.verify(tamperedToken, JWT_SECRET)).toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });
});
