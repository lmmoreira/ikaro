import { describe, expect, it } from 'vitest';
import { BOOKING_STATUS } from '@ikaro/types';
import type {
  CreateClosureRequest,
  ScheduleClosure,
  ScheduleOpening,
  StaffBookingCardResponse,
  TenantBusinessHours,
} from '@ikaro/types';
import {
  buildActiveDates,
  buildDimmedDates,
  buildSlotLabels,
  buildWeekDayInfo,
  countOverlappingBookings,
  resolveTimelineTitle,
  type ScheduleWeekDayInfo,
} from './schedule-page-derived';

function makeBusinessHours(): TenantBusinessHours {
  return {
    timezone: 'America/Sao_Paulo',
    monday: { open: '09:00', close: '18:00' },
    tuesday: null,
    wednesday: null,
    thursday: null,
    friday: null,
    saturday: null,
    sunday: null,
  };
}

function makeBooking(overrides: Partial<StaffBookingCardResponse> = {}): StaffBookingCardResponse {
  return {
    bookingId: 'booking-1',
    status: BOOKING_STATUS.APPROVED,
    scheduledAt: '2026-08-17T12:00:00.000Z',
    contactName: 'João Silva',
    serviceNames: ['Lavagem completa'],
    totalPrice: { amount: 100, currency: 'BRL' },
    totalDurationMins: 30,
    isCustomer: false,
    ...overrides,
  };
}

describe('buildWeekDayInfo', () => {
  it('marks a day closed only when it has neither regular hours nor a special opening', () => {
    const opening: ScheduleOpening = {
      id: 'opening-1',
      date: '2026-08-18', // Tuesday, normally closed
      startTime: '10:00',
      endTime: '12:00',
      notes: null,
      resourceId: null,
    };
    const info = buildWeekDayInfo(
      ['2026-08-17', '2026-08-18', '2026-08-19'],
      [opening],
      makeBusinessHours(),
    );
    expect(info).toEqual([
      {
        dateKey: '2026-08-17',
        opening: null,
        hours: { open: '09:00', close: '18:00' },
        isClosed: false,
      },
      { dateKey: '2026-08-18', opening, hours: null, isClosed: false },
      { dateKey: '2026-08-19', opening: null, hours: null, isClosed: true },
    ]);
  });
});

describe('buildActiveDates', () => {
  it('collects every distinct date with a booking, opening, or closure', () => {
    const booking = makeBooking({ scheduledAt: '2026-08-17T12:00:00.000Z' });
    const opening: ScheduleOpening = {
      id: 'opening-1',
      date: '2026-08-18',
      startTime: '10:00',
      endTime: '12:00',
      notes: null,
      resourceId: null,
    };
    const closure: ScheduleClosure = {
      id: 'closure-1',
      date: '2026-08-19',
      startTime: null,
      endTime: null,
      reason: 'MAINTENANCE',
      notes: null,
      resourceId: null,
    };
    const dates = buildActiveDates([booking], [opening], [closure], 'America/Sao_Paulo');
    expect(dates).toEqual(new Set(['2026-08-17', '2026-08-18', '2026-08-19']));
  });
});

describe('buildDimmedDates', () => {
  it('returns only the date keys of closed days', () => {
    const weekDayInfo: ScheduleWeekDayInfo[] = [
      {
        dateKey: '2026-08-17',
        opening: null,
        hours: { open: '09:00', close: '18:00' },
        isClosed: false,
      },
      { dateKey: '2026-08-18', opening: null, hours: null, isClosed: true },
    ];
    expect(buildDimmedDates(weekDayInfo)).toEqual(new Set(['2026-08-18']));
  });
});

describe('buildSlotLabels', () => {
  it('builds one time label per slot starting from the timeline start', () => {
    expect(buildSlotLabels(3, 540, 30)).toEqual(['09:00', '09:30', '10:00']);
  });

  it('returns an empty array when there are no slots', () => {
    expect(buildSlotLabels(0, 540, 30)).toEqual([]);
  });
});

describe('resolveTimelineTitle', () => {
  const t = (key: 'statusRegularOpen' | 'specialOpeningBadge' | 'statusClosed') =>
    ({
      statusRegularOpen: 'Aberto na agenda padrão',
      specialOpeningBadge: 'Abertura especial',
      statusClosed: 'Fechado',
    })[key];
  const opening: ScheduleOpening = {
    id: 'opening-1',
    date: '2026-08-18',
    startTime: '10:00',
    endTime: '12:00',
    notes: null,
    resourceId: null,
  };

  it('prioritizes the special-opening title over the closed title', () => {
    expect(resolveTimelineTitle(t, opening, true)).toBe('Abertura especial');
  });

  it('falls back to the closed title when there is no special opening', () => {
    expect(resolveTimelineTitle(t, null, true)).toBe('Fechado');
  });

  it('falls back to the regular-open title otherwise', () => {
    expect(resolveTimelineTitle(t, null, false)).toBe('Aberto na agenda padrão');
  });
});

describe('countOverlappingBookings', () => {
  it('counts only bookings on the closure date that overlap its time window', () => {
    const overlapping = makeBooking({
      bookingId: 'overlap',
      scheduledAt: '2026-08-17T12:00:00.000Z', // 09:00 local
      totalDurationMins: 60,
    });
    const nonOverlapping = makeBooking({
      bookingId: 'no-overlap',
      scheduledAt: '2026-08-17T18:00:00.000Z', // 15:00 local
      totalDurationMins: 30,
    });
    const otherDay = makeBooking({
      bookingId: 'other-day',
      scheduledAt: '2026-08-18T12:00:00.000Z',
      totalDurationMins: 60,
    });
    const body: CreateClosureRequest = {
      date: '2026-08-17',
      reason: 'MAINTENANCE',
      startTime: '09:00',
      endTime: '10:00',
    };

    expect(
      countOverlappingBookings(
        [overlapping, nonOverlapping, otherDay],
        'America/Sao_Paulo',
        body,
        null,
      ),
    ).toBe(1);
  });

  it('falls back to the day hours when the closure body has no explicit start/end', () => {
    const booking = makeBooking({ scheduledAt: '2026-08-17T12:00:00.000Z', totalDurationMins: 30 });
    const body: CreateClosureRequest = { date: '2026-08-17', reason: 'MAINTENANCE' };
    const dayHours = { open: '08:00', close: '18:00' };

    expect(countOverlappingBookings([booking], 'America/Sao_Paulo', body, dayHours)).toBe(1);
  });

  it('returns 0 when there are no bookings on the closure date', () => {
    const body: CreateClosureRequest = { date: '2026-08-17', reason: 'MAINTENANCE' };
    expect(countOverlappingBookings([], 'America/Sao_Paulo', body, null)).toBe(0);
  });
});
