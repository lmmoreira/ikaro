import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bffClient } from '@/shared/lib/api/bff-client';
import {
  createRecurringScheduleAsCustomer,
  endRecurringScheduleAsCustomer,
} from './recurring-booking-schedules';

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

describe('createRecurringScheduleAsCustomer', () => {
  const body = {
    serviceId: 'svc-1',
    recurrence: {
      frequency: 'WEEKLY' as const,
      daysOfWeek: ['monday' as const],
      startTime: '10:00',
      durationMinutes: 60,
    },
    assignmentPolicy: 'RESOLVE_PER_OCCURRENCE' as const,
    startsOn: '2026-10-12',
    endsOn: '2026-11-09',
  };

  it('POSTs the pattern to /recurring-booking-schedules and returns the 201 body', async () => {
    const created = { id: 's-1', status: 'ACTIVE', approvalHoldExpiresAt: null };
    mock.onPost('/recurring-booking-schedules').reply(201, created);

    await expect(createRecurringScheduleAsCustomer(body)).resolves.toEqual(created);

    expect(JSON.parse(mock.history['post']![0]!.data as string)).toEqual(body);
  });

  it('propagates a 409 so the caller can read its conflicts', async () => {
    mock.onPost('/recurring-booking-schedules').reply(409, {
      code: 'BOOKING_RECURRING_SCHEDULE_CONFLICT',
      conflicts: [],
    });

    await expect(createRecurringScheduleAsCustomer(body)).rejects.toThrow();
  });
});
