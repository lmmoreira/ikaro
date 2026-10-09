import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import { RecurrenceOccurrence } from '../../domain/recurrence-rule.helpers';
import {
  BookingScheduledInPastError,
  BookingTooFarAheadError,
  BookingTooSoonError,
} from '../../domain/errors/booking-domain.error';
import { ResourceType } from '../../domain/resource.types';
import {
  assertScheduleStart,
  dropPastOccurrences,
  isRenewalOf,
} from './recurring-booking-schedule-window.helpers';

const TENANT = '10000000-0000-4000-8000-000000000500';
const CUSTOMER_ID = '20000000-0000-4000-8000-000000000005';
const SERVICE_ID = '40000000-0000-4000-8000-000000000005';
const RESOURCE_ID = '50000000-0000-4000-8000-000000000005';
const TIMEZONE = 'America/Sao_Paulo';
const HOUR = 3_600_000;

// Tuesday 2026-11-03 10:00 São Paulo = 13:00Z.
const FIRST_START = new Date('2026-11-03T13:00:00.000Z');

function occurrence(start: Date): RecurrenceOccurrence {
  return {
    occurrenceStart: start,
    occurrenceStartLocalDate: start.toISOString().slice(0, 10),
  };
}

function previousSchedule(endsOn = '2026-10-31'): RecurringBookingSchedule {
  return RecurringBookingSchedule.request({
    tenantId: TENANT,
    customerId: CUSTOMER_ID,
    serviceId: SERVICE_ID,
    recurrence: {
      frequency: 'WEEKLY',
      daysOfWeek: ['tuesday', 'thursday'],
      startTime: '10:00',
      durationMinutes: 120,
    },
    startsOn: '2026-10-06',
    endsOn,
    maxTermDays: 90,
    assignmentPolicy: 'FIXED_ASSIGNMENT',
    resourceAssignments: [
      {
        resourceId: RESOURCE_ID,
        resourceType: ResourceType.ROOM,
        requirementId: null,
        requiredQuantityPosition: null,
      },
    ],
    status: 'ACTIVE',
    approvalHoldExpiresAt: null,
    createdByStaffId: null,
    correlationId: 'corr-window-helpers',
  });
}

describe('isRenewalOf', () => {
  const same = {
    serviceId: SERVICE_ID,
    recurrence: {
      frequency: 'WEEKLY' as const,
      daysOfWeek: ['thursday' as const, 'tuesday' as const],
      startTime: '10:00',
      durationMinutes: 120,
    },
    startsOn: '2026-11-01',
  };

  it('is a renewal when service, weekdays (in any order), time and duration are kept and the start is the day after the old end', () => {
    expect(isRenewalOf(previousSchedule('2026-10-31'), same)).toBe(true);
  });

  it('is a renewal when the new term starts before the old one ended', () => {
    expect(isRenewalOf(previousSchedule('2026-10-31'), { ...same, startsOn: '2026-10-20' })).toBe(
      true,
    );
  });

  it('is not a renewal when the start is more than a day after the old end', () => {
    expect(isRenewalOf(previousSchedule('2026-10-31'), { ...same, startsOn: '2026-11-02' })).toBe(
      false,
    );
  });

  it('is not a renewal when the service differs', () => {
    expect(
      isRenewalOf(previousSchedule(), {
        ...same,
        serviceId: '40000000-0000-4000-8000-000000000099',
      }),
    ).toBe(false);
  });

  it('is not a renewal when a weekday is added or removed', () => {
    const monday = { ...same.recurrence, daysOfWeek: ['tuesday' as const, 'monday' as const] };
    const onlyTuesday = { ...same.recurrence, daysOfWeek: ['tuesday' as const] };
    const threeDays = {
      ...same.recurrence,
      daysOfWeek: ['tuesday' as const, 'thursday' as const, 'friday' as const],
    };
    expect(isRenewalOf(previousSchedule(), { ...same, recurrence: monday })).toBe(false);
    expect(isRenewalOf(previousSchedule(), { ...same, recurrence: onlyTuesday })).toBe(false);
    expect(isRenewalOf(previousSchedule(), { ...same, recurrence: threeDays })).toBe(false);
  });

  it('is not a renewal when the start time differs', () => {
    expect(
      isRenewalOf(previousSchedule(), {
        ...same,
        recurrence: { ...same.recurrence, startTime: '10:30' },
      }),
    ).toBe(false);
  });

  it('is not a renewal when the duration differs', () => {
    expect(
      isRenewalOf(previousSchedule(), {
        ...same,
        recurrence: { ...same.recurrence, durationMinutes: 90 },
      }),
    ).toBe(false);
  });
});

describe('dropPastOccurrences', () => {
  const now = new Date('2026-11-10T13:00:00.000Z');
  const before = occurrence(new Date(now.getTime() - HOUR));
  const exactlyNow = occurrence(new Date(now.getTime()));
  const after = occurrence(new Date(now.getTime() + 1));

  it('drops an occurrence that started before now and one that starts exactly now', () => {
    expect(dropPastOccurrences([before, exactlyNow, after], now)).toEqual([after]);
  });

  it('keeps every occurrence when none has started, in order', () => {
    const later = occurrence(new Date(now.getTime() + 7 * 24 * HOUR));
    expect(dropPastOccurrences([after, later], now)).toEqual([after, later]);
  });

  it('returns an empty list when every occurrence has started', () => {
    expect(dropPastOccurrences([before, exactlyNow], now)).toEqual([]);
  });
});

describe('assertScheduleStart', () => {
  const window = { minAdvanceHours: 24, maxAdvanceDays: 30 };
  // The first occurrence is Tuesday 13:00Z; "now" is set relative to it.
  const params = (now: Date, overrides = {}) => ({
    occurrences: [
      occurrence(FIRST_START),
      occurrence(new Date(FIRST_START.getTime() + 7 * 24 * HOUR)),
    ],
    now,
    timezone: TIMEZONE,
    window,
    enforceWindow: true,
    ...overrides,
  });

  it('accepts a first occurrence exactly at the minimum notice', () => {
    expect(() =>
      assertScheduleStart(params(new Date(FIRST_START.getTime() - 24 * HOUR))),
    ).not.toThrow();
  });

  it('rejects a first occurrence one millisecond inside the minimum notice', () => {
    const now = new Date(FIRST_START.getTime() - 24 * HOUR + 1);
    expect(() => assertScheduleStart(params(now))).toThrow(BookingTooSoonError);
  });

  it('rejects a first occurrence that starts exactly now as past, before the notice rule', () => {
    expect(() => assertScheduleStart(params(FIRST_START))).toThrow(BookingScheduledInPastError);
  });

  it('rejects a first occurrence on the day after the last bookable day', () => {
    // now = 2026-10-04 12:00 local; the last bookable day is today + 30 - 1 = 2026-11-02.
    const now = new Date('2026-10-04T15:00:00.000Z');
    expect(() => assertScheduleStart(params(now))).toThrow(BookingTooFarAheadError);
  });

  it('accepts a first occurrence on the last bookable day', () => {
    // now = 2026-10-05 12:00 local; the last bookable day is 2026-11-03 — the first occurrence's day.
    const now = new Date('2026-10-05T15:00:00.000Z');
    expect(() => assertScheduleStart(params(now))).not.toThrow();
  });

  it('checks only the first occurrence — a later one beyond the window is not refused', () => {
    const now = new Date('2026-10-05T15:00:00.000Z');
    const withFarLater = params(now, {
      occurrences: [
        occurrence(FIRST_START),
        occurrence(new Date(FIRST_START.getTime() + 90 * 24 * HOUR)),
      ],
    });
    expect(() => assertScheduleStart(withFarLater)).not.toThrow();
  });

  it('skips the window but still refuses a past start when the window is not enforced', () => {
    const inNotice = new Date(FIRST_START.getTime() - HOUR);
    expect(() => assertScheduleStart(params(inNotice, { enforceWindow: false }))).not.toThrow();
    expect(() => assertScheduleStart(params(FIRST_START, { enforceWindow: false }))).toThrow(
      BookingScheduledInPastError,
    );
  });
});
