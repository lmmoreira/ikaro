import { describe, expect, it } from 'vitest';
import type { RecurringBookingScheduleListItem } from '@ikaro/types';
import {
  dateKeyToDate,
  isTerminalRecurringSchedule,
  offersRenewal,
  parseOccurrencePage,
  recurrenceEndTime,
  recurringScheduleDetailPath,
  recurringScheduleEndPath,
  recurringScheduleListPath,
  recurringScheduleRenewPath,
  sortedWeekdays,
  splitRecurringScheduleSections,
  totalOccurrencePages,
} from './recurring-schedule-model';

function makeSchedule(
  status: RecurringBookingScheduleListItem['status'],
  id: string = status,
): RecurringBookingScheduleListItem {
  return {
    id,
    customerId: 'c1',
    serviceId: 's1',
    serviceName: 'Sala Aurora',
    recurrence: {
      frequency: 'WEEKLY',
      daysOfWeek: ['tuesday'],
      startTime: '10:00',
      durationMinutes: 120,
    },
    startsOn: '2026-08-19',
    endsOn: '2026-11-11',
    status,
    assignmentPolicy: 'FIXED_ASSIGNMENT',
    resourceIds: [],
    approvalHoldExpiresAt: null,
  };
}

describe('splitRecurringScheduleSections', () => {
  it('puts ACTIVE, PENDING_APPROVAL and both terminal statuses in their sections', () => {
    const sections = splitRecurringScheduleSections([
      makeSchedule('ACTIVE'),
      makeSchedule('PENDING_APPROVAL'),
      makeSchedule('ENDED'),
      makeSchedule('CANCELLED'),
    ]);

    expect(sections.active.map((s) => s.status)).toEqual(['ACTIVE']);
    expect(sections.pending.map((s) => s.status)).toEqual(['PENDING_APPROVAL']);
    expect(sections.ended.map((s) => s.status)).toEqual(['ENDED', 'CANCELLED']);
  });

  it('keeps the order the API returned within a section', () => {
    const sections = splitRecurringScheduleSections([
      makeSchedule('ACTIVE', 'b'),
      makeSchedule('ACTIVE', 'a'),
    ]);

    expect(sections.active.map((s) => s.id)).toEqual(['b', 'a']);
  });
});

describe('isTerminalRecurringSchedule', () => {
  it.each([
    ['ENDED', true],
    ['CANCELLED', true],
    ['ACTIVE', false],
    ['PENDING_APPROVAL', false],
  ] as const)('%s → %s', (status, expected) => {
    expect(isTerminalRecurringSchedule(status)).toBe(expected);
  });
});

describe('paths', () => {
  it('builds the list, detail and end paths', () => {
    expect(recurringScheduleListPath('lavacar')).toBe('/lavacar/my-account/recurring-schedules');
    expect(recurringScheduleDetailPath('lavacar', 'abc')).toBe(
      '/lavacar/my-account/recurring-schedules/abc',
    );
    expect(recurringScheduleEndPath('lavacar', 'abc')).toBe(
      '/lavacar/my-account/recurring-schedules/abc/end',
    );
  });

  it('keeps page 1 as the bare detail URL and puts later pages in ?page=', () => {
    expect(recurringScheduleDetailPath('lavacar', 'abc', 1)).toBe(
      '/lavacar/my-account/recurring-schedules/abc',
    );
    expect(recurringScheduleDetailPath('lavacar', 'abc', 3)).toBe(
      '/lavacar/my-account/recurring-schedules/abc?page=3',
    );
  });
});

describe('parseOccurrencePage', () => {
  it.each([
    [undefined, 1],
    ['2', 2],
    ['12', 12],
    ['0', 1],
    ['-3', 1],
    ['abc', 1],
    ['2.5', 1],
    ['', 1],
    ['9999999', 1],
  ])('%s → %s', (raw, expected) => {
    expect(parseOccurrencePage(raw)).toBe(expected);
  });
});

describe('totalOccurrencePages', () => {
  it('rounds up and never goes below one page', () => {
    expect(totalOccurrencePages(0, 5)).toBe(1);
    expect(totalOccurrencePages(5, 5)).toBe(1);
    expect(totalOccurrencePages(6, 5)).toBe(2);
    expect(totalOccurrencePages(13, 5)).toBe(3);
  });
});

describe('recurrenceEndTime', () => {
  it('adds the duration to the start time', () => {
    expect(recurrenceEndTime({ startTime: '10:00', durationMinutes: 120 })).toBe('12:00');
    expect(recurrenceEndTime({ startTime: '09:30', durationMinutes: 45 })).toBe('10:15');
  });

  it('wraps past midnight', () => {
    expect(recurrenceEndTime({ startTime: '23:00', durationMinutes: 120 })).toBe('01:00');
  });
});

describe('sortedWeekdays', () => {
  it('orders Monday first without mutating the input', () => {
    const input = ['sunday', 'wednesday', 'monday'] as const;
    expect(sortedWeekdays(input)).toEqual(['monday', 'wednesday', 'sunday']);
    expect(input).toEqual(['sunday', 'wednesday', 'monday']);
  });
});

describe('dateKeyToDate', () => {
  it('keeps the calendar day when read back in UTC', () => {
    expect(dateKeyToDate('2026-11-11').toISOString().slice(0, 10)).toBe('2026-11-11');
  });
});

describe('recurringScheduleRenewPath', () => {
  it('is the creation route with the schedule to renew', () => {
    expect(recurringScheduleRenewPath('lavacar', 'abc')).toBe(
      '/lavacar/my-account/recurring-schedules/new?renewFrom=abc',
    );
  });
});

describe('offersRenewal', () => {
  it.each([
    ['ENDED', true],
    ['ACTIVE', false],
    ['PENDING_APPROVAL', false],
    ['CANCELLED', false],
  ] as const)('%s → %s', (status, expected) => {
    expect(offersRenewal(status)).toBe(expected);
  });
});
