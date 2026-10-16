import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/lib/api/errors';
import {
  canRetryApproval,
  classifyDecisionError,
  isSettledOutcome,
  type DecisionOutcome,
} from './recurring-approval-outcome';

function problem(status: number, code: string, extra: Record<string, unknown> = {}): ApiError {
  return new ApiError(status, code, { code, ...extra });
}

describe('classifyDecisionError', () => {
  it('reads the conflicting dates of a 409 …CONFLICT, with their reasons', () => {
    const conflicts = [
      { occurrenceStart: '2026-08-25T13:00:00.000Z', reason: 'OCCUPIED' },
      { occurrenceStart: '2026-09-22T13:00:00.000Z', reason: 'CLOSED' },
    ];

    expect(
      classifyDecisionError(
        problem(409, 'BOOKING_RECURRING_SCHEDULE_CONFLICT', { conflicts }),
        'approve',
      ),
    ).toEqual({ kind: 'conflict', conflicts });
  });

  it('keeps a conflict outcome with an empty list when the body carries no dates', () => {
    expect(
      classifyDecisionError(problem(409, 'BOOKING_RECURRING_SCHEDULE_CONFLICT'), 'approve'),
    ).toEqual({ kind: 'conflict', conflicts: [] });
  });

  it.each([
    ['BOOKING_CUSTOMER_PHONE_NOT_SET', 422, { kind: 'phone' }],
    ['BOOKING_SCHEDULED_IN_PAST', 422, { kind: 'past' }],
    ['BOOKING_RECURRING_SCHEDULE_INELIGIBLE_SERVICE', 422, { kind: 'ineligible' }],
  ] as const)('maps the approval refusal %s', (code, status, expected) => {
    expect(classifyDecisionError(problem(status, code), 'approve')).toEqual(expected);
  });

  it.each(['approve', 'reject'] as const)(
    'maps a 409 …NOT_PENDING_APPROVAL to "not pending" for %s',
    (action) => {
      expect(
        classifyDecisionError(
          problem(409, 'BOOKING_RECURRING_SCHEDULE_NOT_PENDING_APPROVAL'),
          action,
        ),
      ).toEqual({ kind: 'notPending' });
    },
  );

  it('treats a network error, a 5xx and an unmapped code as a generic failure', () => {
    expect(classifyDecisionError(new Error('Network Error'), 'approve')).toEqual({
      kind: 'failure',
      action: 'approve',
    });
    expect(classifyDecisionError(problem(500, 'GENERIC_INTERNAL_ERROR'), 'reject')).toEqual({
      kind: 'failure',
      action: 'reject',
    });
    expect(classifyDecisionError(problem(403, 'BOOKING_FORBIDDEN'), 'approve')).toEqual({
      kind: 'failure',
      action: 'approve',
    });
  });

  it('does not read an approval-only code as meaningful for a rejection', () => {
    expect(
      classifyDecisionError(problem(409, 'BOOKING_RECURRING_SCHEDULE_CONFLICT'), 'reject'),
    ).toEqual({ kind: 'failure', action: 'reject' });
  });
});

describe('isSettledOutcome', () => {
  it.each([
    [{ kind: 'approved', created: 12 }, true],
    [{ kind: 'rejected' }, true],
    [{ kind: 'notPending' }, true],
    [{ kind: 'conflict', conflicts: [] }, false],
    [{ kind: 'phone' }, false],
    [{ kind: 'past' }, false],
    [{ kind: 'ineligible' }, false],
    [{ kind: 'failure', action: 'approve' }, false],
    [null, false],
  ] as [DecisionOutcome | null, boolean][])('%j → %s', (outcome, expected) => {
    expect(isSettledOutcome(outcome)).toBe(expected);
  });
});

describe('canRetryApproval', () => {
  it.each([
    [null, true],
    [{ kind: 'conflict', conflicts: [] }, true],
    [{ kind: 'phone' }, true],
    [{ kind: 'failure', action: 'approve' }, true],
    [{ kind: 'past' }, false],
    [{ kind: 'ineligible' }, false],
  ] as [DecisionOutcome | null, boolean][])('%j → %s', (outcome, expected) => {
    expect(canRetryApproval(outcome)).toBe(expected);
  });
});
