import { describe, expect, it, vi, beforeEach } from 'vitest';
import { notFound } from 'next/navigation';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { decodeJwtPayload } from '@/lib/auth/decode-jwt';
import { BookingDetailFetchError, fetchStaffBookingDetail } from '@/lib/api/dashboard/bookings';
import { loadBookingDetailRouteData } from './booking-route.server';
import { matchBookingDetailRoute } from './booking-route';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('not-found');
  }),
}));

vi.mock('@/lib/auth/decode-jwt', () => ({
  decodeJwtPayload: vi.fn(),
}));

vi.mock('@/lib/api/dashboard/bookings', () => ({
  BookingDetailFetchError: class BookingDetailFetchError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
      super(message);
      this.name = 'BookingDetailFetchError';
      this.status = status;
      Object.setPrototypeOf(this, new.target.prototype);
    }
  },
  fetchStaffBookingDetail: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(decodeJwtPayload).mockReset();
  vi.mocked(fetchStaffBookingDetail).mockReset();
  vi.mocked(notFound).mockClear();
});

describe('booking-route', () => {
  it('matches detail, complete, and reschedule routes', () => {
    expect(matchBookingDetailRoute('/dashboard/bookings/booking-1')).toEqual({
      bookingId: 'booking-1',
      action: null,
    });
    expect(matchBookingDetailRoute('/dashboard/bookings/booking-1/complete')).toEqual({
      bookingId: 'booking-1',
      action: 'complete',
    });
    expect(matchBookingDetailRoute('/dashboard/bookings/booking-1/reschedule')).toEqual({
      bookingId: 'booking-1',
      action: 'reschedule',
    });
    expect(matchBookingDetailRoute('/dashboard/bookings')).toBeNull();
  });

  it('returns null for an unknown sub-action path', () => {
    expect(matchBookingDetailRoute('/dashboard/bookings/booking-1/other')).toBeNull();
  });

  it('returns null for unrelated routes', () => {
    expect(matchBookingDetailRoute('/dashboard/settings')).toBeNull();
  });

  it('loads booking detail route data with the tenant slug from the JWT', async () => {
    const booking = { bookingId: 'booking-1' } as StaffBookingDetailResponse;
    vi.mocked(decodeJwtPayload).mockReturnValue({ tenantSlug: 'lavacar-bh' });
    vi.mocked(fetchStaffBookingDetail).mockResolvedValue(booking);

    await expect(loadBookingDetailRouteData('token', 'booking-1')).resolves.toEqual({
      booking,
      tenantSlug: 'lavacar-bh',
    });
  });

  it('calls notFound when the booking fetch returns 404', async () => {
    vi.mocked(decodeJwtPayload).mockReturnValue({ tenantSlug: 'lavacar-bh' });
    vi.mocked(fetchStaffBookingDetail).mockRejectedValue(
      new BookingDetailFetchError(404, 'missing'),
    );

    await expect(loadBookingDetailRouteData('token', 'booking-1')).rejects.toThrow('not-found');
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it('rethrows non-404 booking fetch errors', async () => {
    vi.mocked(decodeJwtPayload).mockReturnValue({ tenantSlug: 'lavacar-bh' });
    vi.mocked(fetchStaffBookingDetail).mockRejectedValue(
      new BookingDetailFetchError(500, 'backend-down'),
    );

    await expect(loadBookingDetailRouteData('token', 'booking-1')).rejects.toThrow('backend-down');
    expect(notFound).not.toHaveBeenCalled();
  });

  it('rethrows non-BookingDetailFetchError errors', async () => {
    vi.mocked(decodeJwtPayload).mockReturnValue({ tenantSlug: 'lavacar-bh' });
    vi.mocked(fetchStaffBookingDetail).mockRejectedValue(new Error('network-error'));

    await expect(loadBookingDetailRouteData('token', 'booking-1')).rejects.toThrow('network-error');
    expect(notFound).not.toHaveBeenCalled();
  });

  it('defaults tenantSlug to empty string when missing from JWT', async () => {
    const booking = { bookingId: 'booking-1' } as StaffBookingDetailResponse;
    vi.mocked(decodeJwtPayload).mockReturnValue({});
    vi.mocked(fetchStaffBookingDetail).mockResolvedValue(booking);

    await expect(loadBookingDetailRouteData('token', 'booking-1')).resolves.toEqual({
      booking,
      tenantSlug: '',
    });
  });
});
