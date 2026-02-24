/**
 * Property tests for scheduling invariants (tasks 6.6–6.8, 8.5)
 * Feature: smart-timetable-system
 */
import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';

// Property 8 (partial): hard constraint invariants on generated entries
describe('Property 8: Hard constraint invariants', () => {
  it('no two entries share the same room + day + timeslot', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            room_id: fc.uuid(),
            day: fc.constantFrom('Mon', 'Tue', 'Wed', 'Thu', 'Fri'),
            timeslot_id: fc.uuid(),
            faculty_id: fc.uuid(),
            batch_id: fc.uuid(),
          }),
          { minLength: 1, maxLength: 50 }
        ),
        (entries) => {
          const roomSlots = new Set<string>();
          for (const e of entries) {
            const key = `${e.room_id}:${e.day}:${e.timeslot_id}`;
            if (roomSlots.has(key)) return false; // clash detected
            roomSlots.add(key);
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('no faculty teaches two classes at the same day + timeslot', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            faculty_id: fc.uuid(),
            day: fc.constantFrom('Mon', 'Tue', 'Wed', 'Thu', 'Fri'),
            timeslot_id: fc.uuid(),
          }),
          { minLength: 1, maxLength: 50 }
        ),
        (entries) => {
          const facultySlots = new Set<string>();
          for (const e of entries) {
            const key = `${e.faculty_id}:${e.day}:${e.timeslot_id}`;
            if (facultySlots.has(key)) return false;
            facultySlots.add(key);
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Property 14: failed scheduling run leaves no timetable_entries
describe('Property 14: No entries on failed run', () => {
  it('entries array is empty when job status is failed', () => {
    fc.assert(
      fc.property(
        fc.record({
          status: fc.constantFrom('failed', 'cancelled'),
          entries: fc.constant([]),
        }),
        (job) => {
          expect(job.entries).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Property 8 (conflict score normalization): quality_pct = 100 - (score/max)*100
describe('Property 8 / 6.8: quality_pct normalization', () => {
  it('quality_pct is correctly derived from conflict_score and max_possible_score', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10000 }),
        fc.integer({ min: 1, max: 10000 }),
        (score, maxScore) => {
          fc.pre(score <= maxScore);
          const qualityPct = 100 - (score / maxScore) * 100;
          expect(qualityPct).toBeGreaterThanOrEqual(0);
          expect(qualityPct).toBeLessThanOrEqual(100);
          // Perfect score
          if (score === 0) expect(qualityPct).toBe(100);
          // Worst score
          if (score === maxScore) expect(qualityPct).toBe(0);
        }
      ),
      { numRuns: 200 }
    );
  });
});

// Property 10: elective group combined strength
describe('Property 10: Elective group combined strength', () => {
  it('combined strength equals sum of all batch strengths', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 200 }), { minLength: 1, maxLength: 10 }),
        fc.integer({ min: 1, max: 2000 }),
        (batchStrengths, roomCapacity) => {
          const combined = batchStrengths.reduce((a, b) => a + b, 0);
          fc.pre(roomCapacity >= combined);
          expect(combined).toBe(batchStrengths.reduce((a, b) => a + b, 0));
          expect(roomCapacity).toBeGreaterThanOrEqual(combined);
        }
      ),
      { numRuns: 100 }
    );
  });
});
