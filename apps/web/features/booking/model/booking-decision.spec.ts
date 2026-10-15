import { describe, expect, it, vi } from 'vitest';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { bookingNeedsDecision, buildBookingRefreshedHandler } from './booking-decision';

describe('bookingNeedsDecision', () => {
  it.each(['PENDING', 'INFO_REQUESTED', 'APPROVED'] as const)(
    'is true for a %s booking with an open entry',
    (status) => {
      expect(bookingNeedsDecision({ hasOpenException: true, status })).toBe(true);
    },
  );

  it.each(['CANCELLED', 'REJECTED', 'COMPLETED', 'NO_SHOW'] as const)(
    'is false for a %s booking even if an entry is still listed as open',
    (status) => {
      expect(bookingNeedsDecision({ hasOpenException: true, status })).toBe(false);
    },
  );

  it('is false without an open entry', () => {
    expect(bookingNeedsDecision({ hasOpenException: false, status: 'APPROVED' })).toBe(false);
  });
});

describe('buildBookingRefreshedHandler', () => {
  const fresh = (status: StaffBookingDetailResponse['status']) =>
    ({ bookingId: 'b-1', status, hasOpenException: false }) as StaffBookingDetailResponse;

  it('replaces the page’s booking with the server’s and leaves the action state alone', () => {
    const setBooking = vi.fn();
    const setActionState = vi.fn();

    buildBookingRefreshedHandler({ setBooking, setActionState })(fresh('APPROVED'));

    expect(setBooking).toHaveBeenCalledWith(fresh('APPROVED'));
    expect(setActionState).not.toHaveBeenCalled();
  });

  it('also shows the cancelled state when the refreshed booking is cancelled', () => {
    const setBooking = vi.fn();
    const setActionState = vi.fn();

    buildBookingRefreshedHandler({ setBooking, setActionState })(fresh('CANCELLED'));

    expect(setBooking).toHaveBeenCalledWith(fresh('CANCELLED'));
    expect(setActionState).toHaveBeenCalledWith('cancelled');
  });
});
