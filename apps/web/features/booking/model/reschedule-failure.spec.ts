import { describe, expect, it } from 'vitest';
import { BookingErrorCode } from '@ikaro/types';
import { classifyRescheduleFailure, shouldReloadSlots } from './reschedule-failure';

describe('classifyRescheduleFailure', () => {
  it.each([
    [BookingErrorCode.RESCHEDULE_WINDOW_EXPIRED, 'windowExpired'],
    [BookingErrorCode.SLOT_UNAVAILABLE, 'slotTaken'],
    [BookingErrorCode.BUNDLE_PARTIALLY_UNAVAILABLE, 'bundleUnavailable'],
    [BookingErrorCode.LEG_UNAVAILABLE, 'bundleUnavailable'],
    [BookingErrorCode.SCHEDULED_IN_PAST, 'bookingWindow'],
    [BookingErrorCode.TOO_SOON, 'bookingWindow'],
    [BookingErrorCode.TOO_FAR_AHEAD, 'bookingWindow'],
  ])('maps %s to %s', (code, kind) => {
    expect(classifyRescheduleFailure(code)).toEqual({ kind, code });
  });

  it('treats an unrecognized or missing code as generic', () => {
    expect(classifyRescheduleFailure('BOOKING_INVALID_TRANSITION').kind).toBe('generic');
    expect(classifyRescheduleFailure(undefined)).toEqual({ kind: 'generic', code: undefined });
  });
});

describe('shouldReloadSlots', () => {
  it('reloads the list for a conflict, a bundle conflict and a booking-window refusal', () => {
    expect(shouldReloadSlots(classifyRescheduleFailure(BookingErrorCode.SLOT_UNAVAILABLE))).toBe(
      true,
    );
    expect(shouldReloadSlots(classifyRescheduleFailure(BookingErrorCode.LEG_UNAVAILABLE))).toBe(
      true,
    );
    expect(shouldReloadSlots(classifyRescheduleFailure(BookingErrorCode.TOO_SOON))).toBe(true);
  });

  it('keeps the list for a generic failure and for an expired window', () => {
    expect(shouldReloadSlots(classifyRescheduleFailure(undefined))).toBe(false);
    expect(
      shouldReloadSlots(classifyRescheduleFailure(BookingErrorCode.RESCHEDULE_WINDOW_EXPIRED)),
    ).toBe(false);
  });
});
