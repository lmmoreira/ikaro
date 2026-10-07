import { describe, expect, it } from 'vitest';
import { initialRescheduleDate } from './reschedule-date';

const TIMEZONE = 'America/Sao_Paulo';
const NOW = new Date('2030-06-10T15:00:00.000Z');
const WINDOW = { minAdvanceHours: 0, maxAdvanceDays: 90 };

function startInDays(days: number): Date {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);
}

function initial(currentStart: Date, window = WINDOW): string | null {
  return initialRescheduleDate({ currentStart, now: NOW, timezone: TIMEZONE, window });
}

describe('initialRescheduleDate', () => {
  it('keeps the booking day when the 14-day strip offers it', () => {
    expect(initial(startInDays(5))).toBe('2030-06-15');
    expect(initial(startInDays(13))).toBe('2030-06-23');
  });

  it('returns null when the booking is beyond the 14-day strip', () => {
    expect(initial(startInDays(14))).toBeNull();
    expect(initial(startInDays(40))).toBeNull();
  });

  it('returns null when the booking is beyond the effective maximum advance', () => {
    expect(initial(startInDays(5), { minAdvanceHours: 0, maxAdvanceDays: 3 })).toBeNull();
    expect(initial(startInDays(2), { minAdvanceHours: 0, maxAdvanceDays: 3 })).toBe('2030-06-12');
  });

  it('returns null when the booking day is before the first day the minimum notice allows', () => {
    expect(initial(startInDays(1), { minAdvanceHours: 72, maxAdvanceDays: 90 })).toBeNull();
    expect(initial(startInDays(4), { minAdvanceHours: 72, maxAdvanceDays: 90 })).toBe('2030-06-14');
  });

  it('reads the booking day in the tenant timezone, not UTC', () => {
    const lateEvening = new Date('2030-06-15T01:30:00.000Z');

    expect(initial(lateEvening)).toBe('2030-06-14');
  });
});
