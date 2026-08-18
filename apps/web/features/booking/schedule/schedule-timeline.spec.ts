import { describe, expect, it } from 'vitest';
import type {
  ScheduleClosure,
  ScheduleOpening,
  StaffBookingCardResponse,
  TenantBusinessHours,
} from '@ikaro/types';
import { BOOKING_STATUS } from '@ikaro/types';
import {
  buildBlockStyle,
  buildScheduleReturnTo,
  buildTimelineDayData,
  buildTimelineEvents,
  buildWeekShift,
  formatEventRange,
  getClosureReasonLabel,
  getEventMinutes,
  getSlotHeight,
  normalizeScheduleStatuses,
  toLocalDate,
} from './schedule-timeline';

function makeBusinessHours(overrides: Partial<TenantBusinessHours> = {}): TenantBusinessHours {
  return {
    timezone: 'America/Sao_Paulo',
    monday: { open: '09:00', close: '18:00' },
    tuesday: null,
    wednesday: null,
    thursday: null,
    friday: null,
    saturday: null,
    sunday: null,
    ...overrides,
  };
}

describe('getSlotHeight', () => {
  it('scales proportionally to slot granularity, with an 18px floor', () => {
    expect(getSlotHeight(30)).toBe(48);
    expect(getSlotHeight(60)).toBe(96);
    expect(getSlotHeight(30, 0.45)).toBe(22);
    expect(getSlotHeight(15, 0.1)).toBe(18);
  });
});

describe('getEventMinutes', () => {
  it('never returns less than the slot size, even for a zero-length event', () => {
    expect(getEventMinutes(0, 0, 30)).toBe(30);
    expect(getEventMinutes(0, 60, 30)).toBe(60);
  });
});

describe('buildWeekShift', () => {
  it('shifts a week-start date key by the given number of days', () => {
    expect(buildWeekShift('2026-08-17', 7)).toBe('2026-08-24');
    expect(buildWeekShift('2026-08-17', -7)).toBe('2026-08-10');
  });
});

describe('toLocalDate', () => {
  it('parses a date key as local midnight, not UTC', () => {
    const date = toLocalDate('2026-08-18');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(7);
    expect(date.getDate()).toBe(18);
  });
});

describe('formatEventRange', () => {
  it('joins two times with an en dash', () => {
    expect(formatEventRange('09:00', '10:00')).toBe('09:00–10:00');
  });
});

describe('buildTimelineEvents', () => {
  it('returns an empty, zero-width timeline when the day has no hours and no special opening', () => {
    const result = buildTimelineEvents({
      selectedDateKey: '2026-08-18',
      timezone: 'America/Sao_Paulo',
      slotGranularityMinutes: 30,
      businessHours: makeBusinessHours(),
      bookings: [],
      closures: [],
      openings: [],
    });
    expect(result).toEqual({
      timelineStartMinutes: 0,
      timelineEndMinutes: 0,
      slotCount: 0,
      slotHeight: 48,
      events: [],
    });
  });

  it('uses the regular business hours for the weekday when there is no special opening', () => {
    const result = buildTimelineEvents({
      selectedDateKey: '2026-08-17', // a Monday
      timezone: 'America/Sao_Paulo',
      slotGranularityMinutes: 30,
      businessHours: makeBusinessHours(),
      bookings: [],
      closures: [],
      openings: [],
    });
    expect(result.timelineStartMinutes).toBe(540);
    expect(result.timelineEndMinutes).toBe(1080);
    expect(result.slotCount).toBe(18);
  });

  it('a special opening on a normally-closed day overrides the (absent) regular hours', () => {
    const opening: ScheduleOpening = {
      id: 'opening-1',
      date: '2026-08-18', // a Tuesday, closed in makeBusinessHours()
      startTime: '10:00',
      endTime: '14:00',
      notes: null,
    };
    const result = buildTimelineEvents({
      selectedDateKey: '2026-08-18',
      timezone: 'America/Sao_Paulo',
      slotGranularityMinutes: 30,
      businessHours: makeBusinessHours(),
      bookings: [],
      closures: [],
      openings: [opening],
    });
    expect(result.timelineStartMinutes).toBe(600);
    expect(result.timelineEndMinutes).toBe(840);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].kind).toBe('opening');
  });

  it('includes bookings only for the selected date, sorted with closures/openings first at the same start time', () => {
    const booking: StaffBookingCardResponse = {
      bookingId: 'booking-1',
      status: BOOKING_STATUS.APPROVED,
      scheduledAt: '2026-08-17T12:00:00.000Z', // 09:00 America/Sao_Paulo
      contactName: 'João Silva',
      serviceNames: ['Lavagem completa'],
      totalPrice: { amount: 100, currency: 'BRL' },
      totalDurationMins: 30,
      isCustomer: false,
    };
    const otherDayBooking: StaffBookingCardResponse = {
      ...booking,
      bookingId: 'booking-2',
      scheduledAt: '2026-08-18T12:00:00.000Z',
    };
    const closure: ScheduleClosure = {
      id: 'closure-1',
      date: '2026-08-17',
      startTime: '09:00',
      endTime: '09:30',
      reason: 'MAINTENANCE',
      notes: null,
    };

    const result = buildTimelineEvents({
      selectedDateKey: '2026-08-17',
      timezone: 'America/Sao_Paulo',
      slotGranularityMinutes: 30,
      businessHours: makeBusinessHours(),
      bookings: [booking, otherDayBooking],
      closures: [closure],
      openings: [],
    });

    expect(result.events).toHaveLength(2);
    expect(result.events.map((event) => event.kind)).toEqual(['closure', 'booking']);
  });
});

describe('buildTimelineDayData', () => {
  it('marks the day closed when there are no regular hours and no special opening', () => {
    const data = buildTimelineDayData({
      selectedDateKey: '2026-08-18',
      timezone: 'America/Sao_Paulo',
      slotGranularityMinutes: 30,
      businessHours: makeBusinessHours(),
      bookings: [],
      closures: [],
      openings: [],
    });
    expect(data.selectedDayClosed).toBe(true);
    expect(data.selectedDayHours).toBeNull();
    expect(data.selectedOpening).toBeNull();
  });

  it('marks the day open when regular hours exist', () => {
    const data = buildTimelineDayData({
      selectedDateKey: '2026-08-17',
      timezone: 'America/Sao_Paulo',
      slotGranularityMinutes: 30,
      businessHours: makeBusinessHours(),
      bookings: [],
      closures: [],
      openings: [],
    });
    expect(data.selectedDayClosed).toBe(false);
    expect(data.selectedDayHours).toEqual({ open: '09:00', close: '18:00' });
  });
});

describe('buildBlockStyle', () => {
  it('clamps a block to the timeline window and enforces a minimum height of one slot', () => {
    const style = buildBlockStyle(0, 5, 60, 600, 30, 48);
    expect(style.top).toBe('0px');
    // clampedStart=60, clampedEnd=max(60+30,5)=90 -> event minutes = max(30, 30) = 30 -> 1 slot * 48px
    expect(style.height).toBe('48px');
  });

  it('computes top/height proportionally within the window for a normal block', () => {
    const style = buildBlockStyle(600, 660, 540, 1080, 30, 48);
    // (600-540)/30 * 48 = 96px top; event minutes = 60 -> 2 slots * 48px = 96px height
    expect(style.top).toBe('96px');
    expect(style.height).toBe('96px');
  });
});

describe('getClosureReasonLabel', () => {
  const t = (key: 'reasonDayOff' | 'reasonMaintenance' | 'reasonHoliday') =>
    ({ reasonDayOff: 'Folga', reasonMaintenance: 'Manutenção', reasonHoliday: 'Feriado' })[key];

  it('maps each closure reason to its translated label, defaulting to day-off', () => {
    expect(getClosureReasonLabel(t, 'MAINTENANCE')).toBe('Manutenção');
    expect(getClosureReasonLabel(t, 'HOLIDAY')).toBe('Feriado');
    expect(getClosureReasonLabel(t, 'STAFF_DAY_OFF')).toBe('Folga');
  });
});

describe('normalizeScheduleStatuses', () => {
  it('filters to only the recognized statuses, in canonical option order', () => {
    expect(normalizeScheduleStatuses(['CANCELLED', 'PENDING', 'CANCELLED'])).toEqual([
      'PENDING',
      'CANCELLED',
    ]);
  });
});

describe('buildScheduleReturnTo', () => {
  it('builds a schedule URL with encoded weekStart/date query params', () => {
    expect(buildScheduleReturnTo('2026-08-17', '2026-08-18')).toBe(
      '/dashboard/schedule?weekStart=2026-08-17&date=2026-08-18',
    );
  });
});
