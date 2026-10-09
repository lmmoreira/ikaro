import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bffClient } from '@/shared/lib/api/bff-client';
import { endRecurringScheduleAsCustomer } from './recurring-booking-schedules';

const mock = new MockAdapter(bffClient);

beforeEach(() => mock.reset());
afterEach(() => mock.reset());

describe('endRecurringScheduleAsCustomer', () => {
  it('POSTs /recurring-booking-schedules/:id/end without a body', async () => {
    mock
      .onPost('/recurring-booking-schedules/s-1/end')
      .reply(200, { id: 's-1', status: 'CANCELLED', cancelledBookingIds: [] });

    await expect(endRecurringScheduleAsCustomer('s-1')).resolves.toBeUndefined();

    expect(mock.history['post']).toHaveLength(1);
    expect(mock.history['post']![0]!.data).toBeUndefined();
  });

  it('propagates the BFF error so the caller can resolve its problem code', async () => {
    mock.onPost('/recurring-booking-schedules/s-1/end').reply(403, { code: 'FORBIDDEN' });

    await expect(endRecurringScheduleAsCustomer('s-1')).rejects.toThrow();
  });
});
