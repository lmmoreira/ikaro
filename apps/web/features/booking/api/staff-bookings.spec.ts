import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BookingResponse, CreateBookingByStaffRequest } from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';
import { createBookingByStaff } from './staff-bookings';

vi.mock('@/shared/lib/api/bff-client', () => ({ bffClient: { post: vi.fn() } }));

const BOOKING = { bookingId: 'b-1', status: 'APPROVED' } as BookingResponse;

afterEach(() => vi.mocked(bffClient.post).mockReset());

describe('createBookingByStaff', () => {
  it('posts the body to the BFF staff route and returns the created booking', async () => {
    vi.mocked(bffClient.post).mockResolvedValue({ data: BOOKING });
    const payload: CreateBookingByStaffRequest = {
      scheduledAt: '2026-06-15T12:00:00.000Z',
      serviceIds: ['svc-1'],
      customerId: 'cust-1',
    };

    await expect(createBookingByStaff(payload)).resolves.toBe(BOOKING);

    expect(bffClient.post).toHaveBeenCalledWith('/bookings/staff', payload);
  });

  it('lets a refusal reach the caller untouched', async () => {
    const failure = new Error('409');
    vi.mocked(bffClient.post).mockRejectedValue(failure);

    await expect(
      createBookingByStaff({ scheduledAt: 'x', serviceIds: [], customerId: 'c' }),
    ).rejects.toBe(failure);
  });
});
