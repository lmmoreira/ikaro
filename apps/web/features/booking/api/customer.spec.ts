import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bffClient } from '@/shared/lib/api/bff-client';
import { rescheduleBookingAsCustomer } from './customer';

const mock = new MockAdapter(bffClient);

beforeEach(() => mock.reset());
afterEach(() => mock.reset());

describe('rescheduleBookingAsCustomer', () => {
  it('PATCHes /bookings/:id/reschedule with scheduledAt only', async () => {
    mock.onPatch('/bookings/b-1/reschedule').reply(200, { bookingId: 'b-1' });

    await rescheduleBookingAsCustomer('b-1', '2030-06-20T13:00:00.000Z');

    expect(JSON.parse(mock.history['patch']![0]!.data as string)).toEqual({
      scheduledAt: '2030-06-20T13:00:00.000Z',
    });
  });

  it('propagates the BFF error so the caller can resolve its problem code', async () => {
    mock.onPatch('/bookings/b-1/reschedule').reply(409, { code: 'BOOKING_SLOT_UNAVAILABLE' });

    await expect(rescheduleBookingAsCustomer('b-1', '2030-06-20T13:00:00.000Z')).rejects.toThrow();
  });
});
