import { describe, expect, it } from 'vitest';
import type { DayGridResponse, StaffBookingCardResponse } from '@ikaro/types';
import { BOOKING_STATUS } from '@ikaro/types';
import { buildHeldTails } from './schedule-held-tails';

const TIMEZONE = 'America/Sao_Paulo';
const DATE_KEY = '2026-08-17';

// 09:00–09:30 local (12:00Z–12:30Z).
function makeBooking(overrides: Partial<StaffBookingCardResponse> = {}): StaffBookingCardResponse {
  return {
    bookingId: 'booking-1',
    status: BOOKING_STATUS.APPROVED,
    scheduledAt: '2026-08-17T12:00:00.000Z',
    contactName: 'João Silva',
    serviceNames: ['Polimento'],
    totalPrice: { amount: 100, currency: 'BRL' },
    totalDurationMins: 30,
    isCustomer: false,
    assignedResources: [],
    ...overrides,
  };
}

type Gap = DayGridResponse['columns'][number]['blocks'][number]['gap'];

function grid(
  columns: Array<{ id: string; name: string; endsAt: string; gap: Gap; refId?: string }>,
): DayGridResponse {
  return {
    date: DATE_KEY,
    columns: columns.map((column) => ({
      resourceId: column.id,
      name: column.name,
      type: 'STAFF',
      blocks: [
        {
          startsAt: '2026-08-17T12:00:00.000Z',
          endsAt: column.endsAt,
          kind: 'BOOKING',
          refId: column.refId ?? 'booking-1',
          gap: column.gap,
        },
      ],
    })),
  };
}

const serviceBuffer: Gap = { source: 'SERVICE_BUFFER', minutes: 60, serviceName: 'Polimento' };
const turnover = (minutes: number): Gap => ({
  source: 'RESOURCE_TURNOVER',
  minutes,
  serviceName: null,
});

function tails(
  dayGrid: DayGridResponse | undefined,
  overrides: Partial<Parameters<typeof buildHeldTails>[0]> = {},
) {
  return buildHeldTails({
    dayGrid,
    bookings: [makeBooking()],
    dateKey: DATE_KEY,
    timezone: TIMEZONE,
    selectedResourceIdSet: new Set(),
    ...overrides,
  });
}

describe('buildHeldTails', () => {
  it('returns nothing before the day-grid has loaded (or for a non-manager)', () => {
    expect(tails(undefined)).toEqual([]);
  });

  it('gives a booking one strip naming every resource held until the same time, with the service buffer as its cause', () => {
    const result = tails(
      grid([
        {
          id: 'res-walace',
          name: 'Walace',
          endsAt: '2026-08-17T13:30:00.000Z',
          gap: serviceBuffer,
        },
        { id: 'res-sala', name: 'Sala 1', endsAt: '2026-08-17T13:30:00.000Z', gap: serviceBuffer },
      ]),
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      bookingId: 'booking-1',
      startMinutes: 570,
      endMinutes: 630,
      resourceName: 'Sala 1, Walace',
      releasesAtLocalTime: '10:30',
      gap: serviceBuffer,
      serviceName: 'Polimento',
    });
  });

  it('runs to the longest hold and names only the resources held that long', () => {
    const result = tails(
      grid([
        { id: 'res-walace', name: 'Walace', endsAt: '2026-08-17T13:00:00.000Z', gap: turnover(30) },
        { id: 'res-sala', name: 'Sala 1', endsAt: '2026-08-17T12:45:00.000Z', gap: turnover(15) },
      ]),
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      resourceName: 'Walace',
      releasesAtLocalTime: '10:00',
      gap: turnover(30),
    });
  });

  it('prefers a recorded cause over an unrecorded (legacy) one at the same release time', () => {
    const result = tails(
      grid([
        { id: 'res-a', name: 'A', endsAt: '2026-08-17T13:00:00.000Z', gap: null },
        { id: 'res-b', name: 'B', endsAt: '2026-08-17T13:00:00.000Z', gap: turnover(30) },
      ]),
    );

    expect(result[0].gap).toEqual(turnover(30));
    expect(result[0].resourceName).toBe('A, B');
  });

  it('keeps an unrecorded origin when no resource has one', () => {
    const result = tails(
      grid([{ id: 'res-a', name: 'A', endsAt: '2026-08-17T13:00:00.000Z', gap: null }]),
    );

    expect(result[0].gap).toBeNull();
  });

  it('draws no strip when the booking is free as soon as it ends', () => {
    expect(
      tails(grid([{ id: 'res-a', name: 'A', endsAt: '2026-08-17T12:30:00.000Z', gap: null }])),
    ).toEqual([]);
  });

  it('considers only the checked resources when some are checked', () => {
    const dayGrid = grid([
      { id: 'res-a', name: 'A', endsAt: '2026-08-17T14:00:00.000Z', gap: serviceBuffer },
      { id: 'res-b', name: 'B', endsAt: '2026-08-17T13:00:00.000Z', gap: turnover(30) },
    ]);

    const result = tails(dayGrid, { selectedResourceIdSet: new Set(['res-b']) });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ resourceName: 'B', releasesAtLocalTime: '10:00' });
  });

  it('draws nothing for a booking missing from the (status-filtered) list or on another day', () => {
    const dayGrid = grid([
      { id: 'res-a', name: 'A', endsAt: '2026-08-17T13:00:00.000Z', gap: serviceBuffer },
    ]);

    expect(tails(dayGrid, { bookings: [] })).toEqual([]);
    expect(tails(dayGrid, { dateKey: '2026-08-18' })).toEqual([]);
  });

  it('draws no positioned strip for a hold that crosses midnight', () => {
    const late = makeBooking({ scheduledAt: '2026-08-18T01:00:00.000Z', totalDurationMins: 60 });
    const dayGrid: DayGridResponse = {
      date: DATE_KEY,
      columns: [
        {
          resourceId: 'res-a',
          name: 'A',
          type: 'STAFF',
          blocks: [
            {
              startsAt: '2026-08-18T01:00:00.000Z', // 22:00 local on 08-17
              endsAt: '2026-08-18T03:30:00.000Z', // 00:30 local on 08-18
              kind: 'BOOKING',
              refId: 'booking-1',
              gap: serviceBuffer,
            },
          ],
        },
      ],
    };

    expect(tails(dayGrid, { bookings: [late] })).toEqual([]);
  });

  it('ignores a malformed block instead of breaking the day', () => {
    const dayGrid = grid([{ id: 'res-a', name: 'A', endsAt: '', gap: null }]);

    expect(tails(dayGrid)).toEqual([]);
  });

  it('ignores class-session blocks', () => {
    const dayGrid = grid([
      { id: 'res-a', name: 'A', endsAt: '2026-08-17T13:00:00.000Z', gap: null },
    ]);
    dayGrid.columns[0].blocks[0].kind = 'CLASS_SESSION';

    expect(tails(dayGrid)).toEqual([]);
  });
});
