import { describe, expect, it } from 'vitest';
import { BOOKING_STATUS } from '@ikaro/types';
import type { ScheduleClosure, ScheduleOpening, StaffBookingCardResponse } from '@ikaro/types';
import {
  assignLanes,
  assignLanesToEventGroup,
  buildBookingTimelineEvent,
  buildClosureTimelineEvent,
  buildOpeningTimelineEvent,
  getBookingDateKey,
  getBookingTimeKey,
  groupOverlappingEvents,
  type BookingTimelineEvent,
} from './schedule-timeline-events';

const EMPTY_RESOURCE_NAME_BY_ID: ReadonlyMap<string, string> = new Map();

function makeBooking(overrides: Partial<StaffBookingCardResponse> = {}): StaffBookingCardResponse {
  return {
    bookingId: 'booking-1',
    status: BOOKING_STATUS.APPROVED,
    scheduledAt: '2026-08-18T12:00:00.000Z',
    contactName: 'João Silva',
    serviceNames: ['Lavagem completa'],
    totalPrice: { amount: 100, currency: 'BRL' },
    totalDurationMins: 30,
    isCustomer: false,
    ...overrides,
  };
}

function makeClosure(overrides: Partial<ScheduleClosure> = {}): ScheduleClosure {
  return {
    id: 'closure-1',
    date: '2026-08-18',
    startTime: null,
    endTime: null,
    reason: 'MAINTENANCE',
    notes: null,
    resourceId: null,
    ...overrides,
  };
}

const TIMEZONE = 'America/Sao_Paulo';

describe('getBookingTimeKey', () => {
  it('derives start/end local time-of-day from scheduledAt + duration', () => {
    const booking = makeBooking({ scheduledAt: '2026-08-18T12:00:00.000Z', totalDurationMins: 45 });
    expect(getBookingTimeKey(booking, TIMEZONE)).toEqual({ startTime: '09:00', endTime: '09:45' });
  });
});

describe('getBookingDateKey', () => {
  it('converts scheduledAt to the local date key', () => {
    expect(
      getBookingDateKey(makeBooking({ scheduledAt: '2026-08-18T12:00:00.000Z' }), TIMEZONE),
    ).toBe('2026-08-18');
  });
});

describe('buildBookingTimelineEvent', () => {
  it('sets warning=true when the booking overlaps a closure window', () => {
    const booking = makeBooking({ scheduledAt: '2026-08-18T12:00:00.000Z', totalDurationMins: 30 });
    const closures = [makeClosure({ startTime: '08:30', endTime: '09:30' })];
    const event = buildBookingTimelineEvent(booking, TIMEZONE, closures, '08:00', '18:00');
    expect(event.warning).toBe(true);
    expect(event.kind).toBe('booking');
    expect(event.title).toBe('João Silva');
    expect(event.subtitle).toBe('Lavagem completa');
  });

  it('sets warning=false when no closure overlaps', () => {
    const booking = makeBooking({ scheduledAt: '2026-08-18T12:00:00.000Z', totalDurationMins: 30 });
    const closures = [makeClosure({ startTime: '14:00', endTime: '15:00' })];
    const event = buildBookingTimelineEvent(booking, TIMEZONE, closures, '08:00', '18:00');
    expect(event.warning).toBe(false);
  });

  it('falls back to the active hours when a closure has no explicit start/end', () => {
    const booking = makeBooking({ scheduledAt: '2026-08-18T12:00:00.000Z', totalDurationMins: 30 });
    const closures = [makeClosure({ startTime: null, endTime: null })];
    const event = buildBookingTimelineEvent(booking, TIMEZONE, closures, '08:00', '18:00');
    expect(event.warning).toBe(true);
  });

  it('defaults resourceNames to an empty array when omitted', () => {
    const booking = makeBooking();
    const event = buildBookingTimelineEvent(booking, TIMEZONE, [], '08:00', '18:00');
    expect(event.resourceNames).toEqual([]);
  });

  it('carries every checked resource name it was given, in order (TD44 Story 1)', () => {
    const booking = makeBooking();
    const event = buildBookingTimelineEvent(booking, TIMEZONE, [], '08:00', '18:00', [
      'Camila Duarte',
      'Sala 1',
    ]);
    expect(event.resourceNames).toEqual(['Camila Duarte', 'Sala 1']);
  });
});

describe('buildClosureTimelineEvent', () => {
  it('uses the closure own start/end when set', () => {
    const event = buildClosureTimelineEvent(
      makeClosure({ startTime: '10:00', endTime: '11:00', reason: 'HOLIDAY', notes: 'Feriado' }),
      '08:00',
      '18:00',
      EMPTY_RESOURCE_NAME_BY_ID,
    );
    expect(event.startMinutes).toBe(600);
    expect(event.endMinutes).toBe(660);
    expect(event.title).toBe('HOLIDAY');
    expect(event.subtitle).toBe('Feriado');
    expect(event.resourceName).toBeNull();
    expect(event.laneIndex).toBe(0);
    expect(event.laneCount).toBe(1);
  });

  it('falls back to the active hours when the closure has no explicit start/end', () => {
    const event = buildClosureTimelineEvent(
      makeClosure(),
      '08:00',
      '18:00',
      EMPTY_RESOURCE_NAME_BY_ID,
    );
    expect(event.startMinutes).toBe(480);
    expect(event.endMinutes).toBe(1080);
  });

  it('resolves resourceName from the resourceNameById map when the closure is resource-scoped', () => {
    const event = buildClosureTimelineEvent(
      makeClosure({ resourceId: 'res-1' }),
      '08:00',
      '18:00',
      new Map([['res-1', 'Leonardo']]),
    );
    expect(event.resourceName).toBe('Leonardo');
  });

  it('resolves resourceName to null when resourceId is set but missing from the map', () => {
    const event = buildClosureTimelineEvent(
      makeClosure({ resourceId: 'res-unknown' }),
      '08:00',
      '18:00',
      EMPTY_RESOURCE_NAME_BY_ID,
    );
    expect(event.resourceName).toBeNull();
  });
});

describe('buildOpeningTimelineEvent', () => {
  it('returns null when there is no selected opening', () => {
    expect(buildOpeningTimelineEvent(null, EMPTY_RESOURCE_NAME_BY_ID)).toBeNull();
  });

  it('builds an opening event from a special opening', () => {
    const opening: ScheduleOpening = {
      id: 'opening-1',
      date: '2026-08-18',
      startTime: '09:00',
      endTime: '13:00',
      notes: 'Plantão especial',
      resourceId: null,
    };
    const event = buildOpeningTimelineEvent(opening, EMPTY_RESOURCE_NAME_BY_ID);
    expect(event).toEqual({
      kind: 'opening',
      id: 'opening-1',
      startMinutes: 540,
      endMinutes: 780,
      title: 'Plantão especial',
      subtitle: '',
      opening,
      resourceName: null,
      laneIndex: 0,
      laneCount: 1,
    });
  });

  it('resolves resourceName from the resourceNameById map when the opening is resource-scoped', () => {
    const opening: ScheduleOpening = {
      id: 'opening-1',
      date: '2026-08-18',
      startTime: '09:00',
      endTime: '13:00',
      notes: null,
      resourceId: 'res-1',
    };
    const event = buildOpeningTimelineEvent(opening, new Map([['res-1', 'Walace']]));
    expect(event?.resourceName).toBe('Walace');
  });
});

function bookingEvent(id: string, startMinutes: number, endMinutes: number): BookingTimelineEvent {
  return {
    kind: 'booking',
    id,
    startMinutes,
    endMinutes,
    title: id,
    subtitle: '',
    warning: false,
    resourceNames: [],
    laneIndex: 0,
    laneCount: 1,
    booking: makeBooking({ bookingId: id }),
  };
}

describe('groupOverlappingEvents', () => {
  it('groups bookings that overlap in time and separates non-overlapping ones', () => {
    const a = bookingEvent('a', 0, 60);
    const b = bookingEvent('b', 30, 90);
    const c = bookingEvent('c', 120, 180);
    const groups = groupOverlappingEvents([a, b, c]);
    expect(groups).toHaveLength(2);
    expect(groups[0].map((e) => e.id)).toEqual(['a', 'b']);
    expect(groups[1].map((e) => e.id)).toEqual(['c']);
  });

  it('returns an empty array for no events', () => {
    expect(groupOverlappingEvents([])).toEqual([]);
  });
});

describe('assignLanesToEventGroup', () => {
  it('assigns the same lane to non-overlapping events within a group and separate lanes to overlapping ones', () => {
    const a = bookingEvent('a', 0, 60);
    const b = bookingEvent('b', 30, 90);
    const assigned = assignLanesToEventGroup([a, b]);
    expect(assigned.find((e) => e.id === 'a')?.laneIndex).toBe(0);
    expect(assigned.find((e) => e.id === 'b')?.laneIndex).toBe(1);
    expect(assigned.every((e) => e.laneCount === 2)).toBe(true);
  });

  it('reuses a freed lane once the earlier event in it has ended', () => {
    const a = bookingEvent('a', 0, 30);
    const b = bookingEvent('b', 30, 60);
    const assigned = assignLanesToEventGroup([a, b]);
    expect(assigned.find((e) => e.id === 'a')?.laneIndex).toBe(0);
    expect(assigned.find((e) => e.id === 'b')?.laneIndex).toBe(0);
    expect(assigned.every((e) => e.laneCount === 1)).toBe(true);
  });
});

describe('assignLanes', () => {
  it('composes grouping + lane assignment across independent overlap groups', () => {
    const a = bookingEvent('a', 0, 60);
    const b = bookingEvent('b', 30, 90);
    const c = bookingEvent('c', 120, 180);
    const assigned = assignLanes([a, b, c]);
    expect(assigned.find((e) => e.id === 'c')?.laneCount).toBe(1);
    expect(
      assigned.filter((e) => e.id === 'a' || e.id === 'b').every((e) => e.laneCount === 2),
    ).toBe(true);
  });

  it('returns an empty array for no events', () => {
    expect(assignLanes([])).toEqual([]);
  });

  it('splits two overlapping resource-scoped closures into separate lanes (M21-S05 live-testing follow-up)', () => {
    const leonardo = buildClosureTimelineEvent(
      makeClosure({
        id: 'closure-leonardo',
        startTime: '09:00',
        endTime: '10:00',
        resourceId: 'res-1',
      }),
      '08:00',
      '18:00',
      new Map([
        ['res-1', 'Leonardo'],
        ['res-2', 'Walace'],
      ]),
    );
    const walace = buildClosureTimelineEvent(
      makeClosure({
        id: 'closure-walace',
        startTime: '09:00',
        endTime: '10:00',
        resourceId: 'res-2',
      }),
      '08:00',
      '18:00',
      new Map([
        ['res-1', 'Leonardo'],
        ['res-2', 'Walace'],
      ]),
    );

    const assigned = assignLanes([leonardo, walace]);

    expect(assigned.every((e) => e.laneCount === 2)).toBe(true);
    expect(new Set(assigned.map((e) => e.laneIndex))).toEqual(new Set([0, 1]));
    expect(assigned.map((e) => e.resourceName).sort()).toEqual(['Leonardo', 'Walace']);
  });
});
