import { describe, expect, it } from 'vitest';
import { matchBookingDetailRoute } from './booking-route';

describe('matchBookingDetailRoute', () => {
  it('returns the booking id for a detail route', () => {
    expect(matchBookingDetailRoute('/dashboard/bookings/booking-123')).toEqual({
      bookingId: 'booking-123',
      action: null,
    });
  });

  it('returns the nested action when present', () => {
    expect(matchBookingDetailRoute('/dashboard/bookings/booking-123/complete')).toEqual({
      bookingId: 'booking-123',
      action: 'complete',
    });
  });

  it('returns null for unrelated paths', () => {
    expect(matchBookingDetailRoute('/dashboard/services')).toBeNull();
  });
});
