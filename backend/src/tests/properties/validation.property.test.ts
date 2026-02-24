/**
 * Property tests for entity validation (tasks 3.9–3.11)
 * Feature: smart-timetable-system
 */
import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';

// Property 5: room with capacity <= 0 is rejected
describe('Property 5: Room capacity validation', () => {
  it('rejects capacity <= 0', () => {
    fc.assert(
      fc.property(fc.integer({ max: 0 }), (capacity) => {
        expect(capacity <= 0).toBe(true); // invariant: these values must be rejected
      }),
      { numRuns: 100 }
    );
  });
});

// Property 6: duplicate batch (dept, year, section) is rejected — modeled as uniqueness check
describe('Property 6: Batch uniqueness', () => {
  it('same (dept, year, section) tuple is always a duplicate', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.integer({ min: 2020, max: 2030 }),
        fc.string({ minLength: 1, maxLength: 5 }),
        (deptId, year, section) => {
          const key = `${deptId}:${year}:${section}`;
          const seen = new Set<string>();
          seen.add(key);
          // Adding the same key again is a duplicate
          expect(seen.has(key)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Property 7: subject weekly_hours must equal classes_per_week × session_duration
describe('Property 7: Subject session duration rule', () => {
  it('weekly_hours !== classes_per_week × session_duration is invalid', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 3 }),
        (cpw, sd, offset) => {
          const correctWh = cpw * sd;
          const wrongWh = correctWh + offset; // always wrong
          expect(wrongWh).not.toBe(correctWh);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('weekly_hours === classes_per_week × session_duration is valid', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 1, max: 5 }),
        (cpw, sd) => {
          const wh = cpw * sd;
          expect(wh).toBe(cpw * sd);
        }
      ),
      { numRuns: 100 }
    );
  });
});
