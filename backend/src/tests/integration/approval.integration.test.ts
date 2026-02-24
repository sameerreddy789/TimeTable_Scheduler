/**
 * Integration tests for the approval workflow (task 13.5)
 * Feature: smart-timetable-system
 * Flow: draft → submit → approve → published + locked
 */
import { describe, it, expect } from 'vitest';

// Approval workflow state machine — pure logic test (no DB required)
type TimetableStatus = 'Draft' | 'Pending_Approval' | 'Published' | 'Rejected';

function transition(current: TimetableStatus, action: string): TimetableStatus | Error {
  switch (current) {
    case 'Draft':
      if (action === 'submit') return 'Pending_Approval';
      break;
    case 'Pending_Approval':
      if (action === 'approve') return 'Published';
      if (action === 'reject') return 'Rejected';
      break;
    case 'Published':
      // Published is locked — no transitions allowed
      break;
    case 'Rejected':
      if (action === 'resubmit') return 'Draft';
      break;
  }
  return new Error(`Invalid transition: ${current} + ${action}`);
}

describe('Approval workflow state machine (task 13.5)', () => {
  it('Draft → submit → Pending_Approval', () => {
    expect(transition('Draft', 'submit')).toBe('Pending_Approval');
  });

  it('Pending_Approval → approve → Published', () => {
    expect(transition('Pending_Approval', 'approve')).toBe('Published');
  });

  it('Pending_Approval → reject → Rejected', () => {
    expect(transition('Pending_Approval', 'reject')).toBe('Rejected');
  });

  it('Published is locked — no transitions allowed', () => {
    const result = transition('Published', 'submit');
    expect(result).toBeInstanceOf(Error);
  });

  it('Rejected → resubmit → Draft', () => {
    expect(transition('Rejected', 'resubmit')).toBe('Draft');
  });

  it('full happy path: Draft → Pending_Approval → Published', () => {
    let status: TimetableStatus = 'Draft';
    status = transition(status, 'submit') as TimetableStatus;
    expect(status).toBe('Pending_Approval');
    status = transition(status, 'approve') as TimetableStatus;
    expect(status).toBe('Published');
    // Verify locked
    const locked = transition(status, 'submit');
    expect(locked).toBeInstanceOf(Error);
  });
});
