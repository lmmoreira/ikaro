import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bffClient } from '@/shared/lib/api/bff-client';
import {
  approveRecurringScheduleAsStaff,
  createRecurringScheduleAsCustomer,
  endRecurringScheduleAsCustomer,
  getRecurringSchedule,
  listPendingRecurringSchedules,
  rejectRecurringScheduleAsStaff,
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

function pendingItem(id: string) {
  return {
    id,
    customerId: 'c-1',
    serviceId: 'svc-1',
    serviceName: 'Sala Aurora',
    recurrence: {
      frequency: 'WEEKLY' as const,
      daysOfWeek: ['tuesday' as const],
      startTime: '10:00',
      durationMinutes: 120,
    },
    startsOn: '2026-08-19',
    endsOn: '2026-11-11',
    status: 'PENDING_APPROVAL' as const,
    assignmentPolicy: 'FIXED_ASSIGNMENT' as const,
    approvalHoldExpiresAt: '2026-08-11T12:30:00.000Z',
  };
}

describe('listPendingRecurringSchedules', () => {
  it('asks the server for PENDING_APPROVAL only, 100 per page', async () => {
    mock.onGet('/recurring-booking-schedules').reply(200, {
      items: [pendingItem('s-1')],
      pagination: { limit: 100, offset: 0, total: 1, hasMore: false },
    });

    const items = await listPendingRecurringSchedules();

    expect(items.map((i) => i.id)).toEqual(['s-1']);
    expect(mock.history['get']).toHaveLength(1);
    expect(mock.history['get']![0]!.params).toEqual({
      status: 'PENDING_APPROVAL',
      limit: 100,
      offset: 0,
    });
  });

  it('follows pagination.hasMore through every page and drops a repeated row', async () => {
    mock.onGet('/recurring-booking-schedules').reply((config) => {
      const offset = (config.params as { offset: number }).offset;
      return offset === 0
        ? [
            200,
            {
              items: [pendingItem('s-1'), pendingItem('s-2')],
              pagination: { limit: 100, offset: 0, total: 3, hasMore: true },
            },
          ]
        : [
            200,
            {
              items: [pendingItem('s-2'), pendingItem('s-3')],
              pagination: { limit: 100, offset: 100, total: 3, hasMore: false },
            },
          ];
    });

    const items = await listPendingRecurringSchedules();

    expect(items.map((i) => i.id)).toEqual(['s-1', 's-2', 's-3']);
    expect(mock.history['get']).toHaveLength(2);
  });

  it('stops on an empty page even if hasMore still claims more', async () => {
    mock.onGet('/recurring-booking-schedules').reply(200, {
      items: [],
      pagination: { limit: 100, offset: 0, total: 9, hasMore: true },
    });

    await expect(listPendingRecurringSchedules()).resolves.toEqual([]);
    expect(mock.history['get']).toHaveLength(1);
  });

  it('follows hasMore past ten pages, so a long queue is never cut short', async () => {
    mock.onGet('/recurring-booking-schedules').reply((config) => {
      const offset = (config.params as { offset: number }).offset;
      const page = offset / 100;
      return [
        200,
        {
          items: [pendingItem(`s-${page}`)],
          pagination: { limit: 100, offset, total: 12, hasMore: page < 11 },
        },
      ];
    });

    const items = await listPendingRecurringSchedules();

    expect(items).toHaveLength(12);
    expect(mock.history['get']).toHaveLength(12);
  });

  it('keeps reading past a page that only repeats rows already read, so later requests are not lost', async () => {
    mock.onGet('/recurring-booking-schedules').reply((config) => {
      const offset = (config.params as { offset: number }).offset;
      const pages: Record<number, { ids: string[]; hasMore: boolean }> = {
        0: { ids: ['s-1', 's-2'], hasMore: true },
        100: { ids: ['s-1', 's-2'], hasMore: true }, // rows shifted by an insert: all repeats
        200: { ids: ['s-3'], hasMore: false },
      };
      const page = pages[offset]!;
      return [
        200,
        {
          items: page.ids.map(pendingItem),
          pagination: { limit: 100, offset, total: 3, hasMore: page.hasMore },
        },
      ];
    });

    const items = await listPendingRecurringSchedules();

    expect(items.map((i) => i.id)).toEqual(['s-1', 's-2', 's-3']);
    expect(mock.history['get']).toHaveLength(3);
  });

  it('fails loudly, not silently, when hasMore never clears on a page that never changes', async () => {
    mock.onGet('/recurring-booking-schedules').reply(200, {
      items: [pendingItem('s-1')],
      pagination: { limit: 100, offset: 0, total: 1, hasMore: true },
    });

    await expect(listPendingRecurringSchedules()).rejects.toThrow(/exceeded 50 pages/);
    expect(mock.history['get']).toHaveLength(50);
  });

  it('throws at the circuit breaker instead of returning a truncated queue', async () => {
    mock.onGet('/recurring-booking-schedules').reply((config) => {
      const offset = (config.params as { offset: number }).offset;
      return [
        200,
        {
          items: [pendingItem(`s-${offset}`)],
          pagination: { limit: 100, offset, total: 99999, hasMore: true },
        },
      ];
    });

    await expect(listPendingRecurringSchedules()).rejects.toThrow(/exceeded 50 pages/);
    expect(mock.history['get']).toHaveLength(50);
  });

  it('propagates a failure instead of returning a partial list', async () => {
    mock.onGet('/recurring-booking-schedules').reply(500);

    await expect(listPendingRecurringSchedules()).rejects.toThrow();
  });
});

describe('getRecurringSchedule', () => {
  it('GETs /recurring-booking-schedules/:id and returns the item', async () => {
    mock.onGet('/recurring-booking-schedules/s-1').reply(200, pendingItem('s-1'));

    await expect(getRecurringSchedule('s-1')).resolves.toMatchObject({ id: 's-1' });
  });

  it('propagates a 404 so the page can show its not-found state', async () => {
    mock
      .onGet('/recurring-booking-schedules/s-9')
      .reply(404, { code: 'BOOKING_RECURRING_SCHEDULE_NOT_FOUND' });

    await expect(getRecurringSchedule('s-9')).rejects.toThrow();
  });
});

describe('approveRecurringScheduleAsStaff', () => {
  it('POSTs /approve without a body and returns how many reservations were created', async () => {
    mock
      .onPost('/recurring-booking-schedules/s-1/approve')
      .reply(200, { id: 's-1', status: 'ACTIVE', occurrenceCount: 12 });

    await expect(approveRecurringScheduleAsStaff('s-1')).resolves.toEqual({
      id: 's-1',
      status: 'ACTIVE',
      occurrenceCount: 12,
    });
    expect(mock.history['post']![0]!.data).toBeUndefined();
  });

  it('propagates the 409 conflicts payload', async () => {
    mock.onPost('/recurring-booking-schedules/s-1/approve').reply(409, {
      code: 'BOOKING_RECURRING_SCHEDULE_CONFLICT',
      conflicts: [{ occurrenceStart: '2026-09-01T13:00:00.000Z', reason: 'OCCUPIED' }],
    });

    await expect(approveRecurringScheduleAsStaff('s-1')).rejects.toMatchObject({
      status: 409,
      data: { conflicts: [{ reason: 'OCCUPIED' }] },
    });
  });
});

describe('rejectRecurringScheduleAsStaff', () => {
  it('POSTs /reject without a body — the endpoint takes no reason', async () => {
    mock
      .onPost('/recurring-booking-schedules/s-1/reject')
      .reply(200, { id: 's-1', status: 'CANCELLED' });

    await expect(rejectRecurringScheduleAsStaff('s-1')).resolves.toEqual({
      id: 's-1',
      status: 'CANCELLED',
    });
    expect(mock.history['post']![0]!.data).toBeUndefined();
  });
});
