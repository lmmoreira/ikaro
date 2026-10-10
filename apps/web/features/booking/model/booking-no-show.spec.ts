import { describe, expect, it } from 'vitest';
import type { BookingStatusHistoryEntry } from '@ikaro/types';
import { ApiError, AuthError, ForbiddenError } from '@/shared/lib/api/errors';
import {
  hasBookingEnded,
  hasNoShowHistory,
  isCorrectionReasonValid,
  resolveBookingEnd,
  resolveCorrectFailureState,
  resolveCorrectionPoints,
  resolveNoShowFailureState,
} from './booking-no-show';

const booking = { scheduledAt: '2026-06-16T10:00:00.000Z', totalDurationMins: 30 };

function entry(overrides: Partial<BookingStatusHistoryEntry>): BookingStatusHistoryEntry {
  return {
    fromStatus: 'APPROVED',
    toStatus: 'COMPLETED',
    reason: null,
    actorType: 'STAFF',
    actorId: null,
    actorName: null,
    occurredAt: '2026-06-16T11:00:00.000Z',
    ...overrides,
  };
}

describe('resolveBookingEnd / hasBookingEnded', () => {
  it('ends at scheduledAt plus the total duration', () => {
    expect(resolveBookingEnd(booking).toISOString()).toBe('2026-06-16T10:30:00.000Z');
  });

  it('has not ended one millisecond before the end', () => {
    expect(hasBookingEnded(booking, new Date('2026-06-16T10:29:59.999Z'))).toBe(false);
  });

  it('has ended exactly at the end time and after it', () => {
    expect(hasBookingEnded(booking, new Date('2026-06-16T10:30:00.000Z'))).toBe(true);
    expect(hasBookingEnded(booking, new Date('2026-06-16T12:00:00.000Z'))).toBe(true);
  });
});

describe('resolveNoShowFailureState', () => {
  it('maps 409 BOOKING_ALREADY_TERMINAL to the already-closed banner', () => {
    const err = new ApiError(409, 'closed', { code: 'BOOKING_ALREADY_TERMINAL' });
    expect(resolveNoShowFailureState(err)).toBe('no-show-terminal');
  });

  it('maps 422 BOOKING_NOT_YET_ENDED to the not-yet-ended banner', () => {
    const err = new ApiError(422, 'early', { code: 'BOOKING_NOT_YET_ENDED' });
    expect(resolveNoShowFailureState(err)).toBe('no-show-not-ended');
  });

  it.each([
    ['a network failure', new ApiError(0, 'Network Error')],
    ['a 5xx', new ApiError(503, 'Internal server error')],
    [
      'a 409 with another code',
      new ApiError(409, 'x', { code: 'BOOKING_CONCURRENT_MODIFICATION' }),
    ],
    ['a 422 with another code', new ApiError(422, 'x', { code: 'BOOKING_INVALID_TRANSITION' })],
    ['a plain error', new Error('boom')],
  ])('maps %s to the retry banner', (_label, err) => {
    expect(resolveNoShowFailureState(err)).toBe('no-show-error');
  });
});

describe('resolveCorrectFailureState', () => {
  it('maps a 403 to the manager-only banner', () => {
    expect(resolveCorrectFailureState(new ForbiddenError('no', undefined))).toBe(
      'correct-forbidden',
    );
  });

  it.each([
    ['a network failure', new ApiError(0, 'Network Error')],
    ['a 5xx', new ApiError(500, 'Internal server error')],
    ['an expired session', new AuthError('401', undefined)],
  ])('maps %s to the retry banner', (_label, err) => {
    expect(resolveCorrectFailureState(err)).toBe('correct-error');
  });
});

describe('resolveCorrectionPoints', () => {
  const lines = [{ pointsValueAtBooking: 12 }, { pointsValueAtBooking: 5 }] as Parameters<
    typeof resolveCorrectionPoints
  >[0]['lines'];

  it('sums the line points for a customer booking', () => {
    expect(resolveCorrectionPoints({ customerId: 'c-1', lines })).toBe(17);
  });

  it('is null for a guest booking, which has no loyalty account', () => {
    expect(resolveCorrectionPoints({ customerId: null, lines })).toBeNull();
  });
});

describe('isCorrectionReasonValid', () => {
  it('requires 10 to 500 characters after trimming', () => {
    expect(isCorrectionReasonValid('123456789')).toBe(false);
    expect(isCorrectionReasonValid('   123456789   ')).toBe(false);
    expect(isCorrectionReasonValid('1234567890')).toBe(true);
    expect(isCorrectionReasonValid('x'.repeat(500))).toBe(true);
    expect(isCorrectionReasonValid('x'.repeat(501))).toBe(false);
    expect(isCorrectionReasonValid('')).toBe(false);
  });
});

describe('hasNoShowHistory', () => {
  it('is true when any entry enters or leaves NO_SHOW', () => {
    expect(hasNoShowHistory([entry({ toStatus: 'NO_SHOW' })])).toBe(true);
    expect(hasNoShowHistory([entry({ fromStatus: 'NO_SHOW', toStatus: 'COMPLETED' })])).toBe(true);
  });

  it('is false for a history that never touched NO_SHOW, and for none', () => {
    expect(hasNoShowHistory([entry({})])).toBe(false);
    expect(hasNoShowHistory([])).toBe(false);
  });
});
