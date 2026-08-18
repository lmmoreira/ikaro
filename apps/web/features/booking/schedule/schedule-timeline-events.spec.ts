import { describe, expect, it } from 'vitest';
import { BOOKING_STATUS } from '@ikaro/types';
import type { ScheduleClosure, ScheduleOpening, StaffBookingCardResponse } from '@ikaro/types';
import {
  assignBookingLanes,
  assignLanesToBookingGroup,
  buildBookingTimelineEvent,
  buildClosureTimelineEvent,
  buildOpeningTimelineEvent,
  getBookingDateKey,
  getBookingTimeKey,
  groupOverlappingBookings,
  type BookingTimelineEvent,
} from './schedule-timeline-events';

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
});

describe('buildClosureTimelineEvent', () => {
  it('uses the closure own start/end when set', () => {
    const event = buildClosureTimelineEvent(
      makeClosure({ startTime: '10:00', endTime: '11:00', reason: 'HOLIDAY', notes: 'Feriado' }),
      '08:00',
      '18:00',
    );
    expect(event.startMinutes).toBe(600);
    expect(event.endMinutes).toBe(660);
    expect(event.title).toBe('HOLIDAY');
    expect(event.subtitle).toBe('Feriado');
  });

  it('falls back to the active hours when the closure has no explicit start/end', () => {
    const event = buildClosureTimelineEvent(makeClosure(), '08:00', '18:00');
    expect(event.startMinutes).toBe(480);
    expect(event.endMinutes).toBe(1080);
  });
});

describe('buildOpeningTimelineEvent', () => {
  it('returns null when there is no selected opening', () => {
    expect(buildOpeningTimelineEvent(null)).toBeNull();
  });

  it('builds an opening event from a special opening', () => {
    const opening: ScheduleOpening = {
      id: 'opening-1',
      date: '2026-08-18',
      startTime: '09:00',
      endTime: '13:00',
      notes: 'Plantão especial',
    };
    const event = buildOpeningTimelineEvent(opening);
    expect(event).toEqual({
      kind: 'opening',
      id: 'opening-1',
      startMinutes: 540,
      endMinutes: 780,
      title: 'Plantão especial',
      subtitle: '',
      opening,
    });
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
    laneIndex: 0,
    laneCount: 1,
    booking: makeBooking({ bookingId: id }),
  };
}

describe('groupOverlappingBookings', () => {
  it('groups bookings that overlap in time and separates non-overlapping ones', () => {
    const a = bookingEvent('a', 0, 60);
    const b = bookingEvent('b', 30, 90);
    const c = bookingEvent('c', 120, 180);
    const groups = groupOverlappingBookings([a, b, c]);
    expect(groups).toHaveLength(2);
    expect(groups[0].map((e) => e.id)).toEqual(['a', 'b']);
    expect(groups[1].map((e) => e.id)).toEqual(['c']);
  });

  it('returns an empty array for no bookings', () => {
    expect(groupOverlappingBookings([])).toEqual([]);
  });
});

describe('assignLanesToBookingGroup', () => {
  it('assigns the same lane to non-overlapping bookings within a group and separate lanes to overlapping ones', () => {
    const a = bookingEvent('a', 0, 60);
    const b = bookingEvent('b', 30, 90);
    const assigned = assignLanesToBookingGroup([a, b]);
    expect(assigned.find((e) => e.id === 'a')?.laneIndex).toBe(0);
    expect(assigned.find((e) => e.id === 'b')?.laneIndex).toBe(1);
    expect(assigned.every((e) => e.laneCount === 2)).toBe(true);
  });

  it('reuses a freed lane once the earlier booking in it has ended', () => {
    const a = bookingEvent('a', 0, 30);
    const b = bookingEvent('b', 30, 60);
    const assigned = assignLanesToBookingGroup([a, b]);
    expect(assigned.find((e) => e.id === 'a')?.laneIndex).toBe(0);
    expect(assigned.find((e) => e.id === 'b')?.laneIndex).toBe(0);
    expect(assigned.every((e) => e.laneCount === 1)).toBe(true);
  });
});

describe('assignBookingLanes', () => {
  it('composes grouping + lane assignment across independent overlap groups', () => {
    const a = bookingEvent('a', 0, 60);
    const b = bookingEvent('b', 30, 90);
    const c = bookingEvent('c', 120, 180);
    const assigned = assignBookingLanes([a, b, c]);
    expect(assigned.find((e) => e.id === 'c')?.laneCount).toBe(1);
    expect(
      assigned.filter((e) => e.id === 'a' || e.id === 'b').every((e) => e.laneCount === 2),
    ).toBe(true);
  });

  it('returns an empty array for no bookings', () => {
    expect(assignBookingLanes([])).toEqual([]);
  });
});
