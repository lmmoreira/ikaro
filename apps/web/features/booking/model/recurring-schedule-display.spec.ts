import { describe, expect, it } from 'vitest';
import {
  RECURRING_SCHEDULE_STATUS_CLASSES,
  dateKeyToDate,
  recurrenceEndTime,
  sortedWeekdays,
} from './recurring-schedule-display';

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

describe('RECURRING_SCHEDULE_STATUS_CLASSES', () => {
  it('has a style for every status a schedule can be in', () => {
    expect(Object.keys(RECURRING_SCHEDULE_STATUS_CLASSES).sort()).toEqual([
      'ACTIVE',
      'CANCELLED',
      'ENDED',
      'PENDING_APPROVAL',
    ]);
  });
});
