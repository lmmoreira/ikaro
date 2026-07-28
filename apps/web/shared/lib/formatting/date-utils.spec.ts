import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayCarouselLabel,
  dayNumber,
  inWindow,
  isSameDay,
  toISODate,
  toISODateInTimezone,
} from './date-utils';

describe('toISODate', () => {
  it('formats a date as YYYY-MM-DD', () => {
    expect(toISODate(new Date(Date.UTC(2026, 5, 15)))).toBe('2026-06-15');
  });

  it('pads single-digit months and days', () => {
    expect(toISODate(new Date(Date.UTC(2026, 0, 5)))).toBe('2026-01-05');
  });
});

describe('toISODateInTimezone', () => {
  it('returns the date in the given timezone', () => {
    // 2026-06-27T01:00:00Z = 2026-06-26T22:00:00 in America/Sao_Paulo (UTC-3)
    expect(toISODateInTimezone(new Date('2026-06-27T01:00:00.000Z'), 'America/Sao_Paulo')).toBe(
      '2026-06-26',
    );
  });

  it('returns the same date when time is mid-day UTC', () => {
    expect(toISODateInTimezone(new Date('2026-06-26T14:00:00.000Z'), 'America/Sao_Paulo')).toBe(
      '2026-06-26',
    );
  });
});

describe('addDays', () => {
  it('adds days without mutating the original date', () => {
    const original = new Date(Date.UTC(2026, 5, 15));
    const result = addDays(original, 13);

    expect(toISODate(result)).toBe('2026-06-28');
    expect(toISODate(original)).toBe('2026-06-15');
  });

  it('rolls over into the next month', () => {
    expect(toISODate(addDays(new Date(Date.UTC(2026, 5, 25)), 10))).toBe('2026-07-05');
  });
});

describe('isSameDay', () => {
  it('returns true for same UTC date at different times', () => {
    const a = new Date('2026-06-26T08:00:00.000Z');
    const b = new Date('2026-06-26T23:59:59.000Z');
    expect(isSameDay(a, b)).toBe(true);
  });

  it('returns false for adjacent UTC days', () => {
    const a = new Date('2026-06-26T00:00:00.000Z');
    const b = new Date('2026-06-27T00:00:00.000Z');
    expect(isSameDay(a, b)).toBe(false);
  });
});

describe('inWindow', () => {
  const start = new Date('2026-06-26T00:00:00.000Z');
  const end = new Date('2026-07-09T00:00:00.000Z');

  it('returns true for a date strictly within the window', () => {
    expect(inWindow(new Date('2026-07-01T00:00:00.000Z'), start, end)).toBe(true);
  });

  it('returns true on the start boundary', () => {
    expect(inWindow(start, start, end)).toBe(true);
  });

  it('returns true on the end boundary', () => {
    expect(inWindow(end, start, end)).toBe(true);
  });

  it('returns false before the window', () => {
    expect(inWindow(new Date('2026-06-25T23:59:59.000Z'), start, end)).toBe(false);
  });

  it('returns false after the window', () => {
    expect(inWindow(new Date('2026-07-10T00:00:00.000Z'), start, end)).toBe(false);
  });
});

describe('dayNumber', () => {
  it('returns the day of month as a string', () => {
    expect(dayNumber('2026-06-15')).toBe('15');
    expect(dayNumber('2026-06-01')).toBe('1');
  });
});

describe('dayCarouselLabel', () => {
  it('returns todayLabel for index 0 regardless of locale', () => {
    expect(dayCarouselLabel('2026-06-15', 0, 'pt-BR', 'Hoje')).toBe('Hoje');
    expect(dayCarouselLabel('2026-06-15', 0, 'en', 'Today')).toBe('Today');
  });

  it('returns a short weekday in pt-BR for subsequent days', () => {
    // June 16, 2026 is a Tuesday → 'ter.' in pt-BR short format
    const label = dayCarouselLabel('2026-06-16', 1, 'pt-BR', 'Hoje');
    expect(label).toBe('ter.');
  });

  it('returns a short weekday in en for subsequent days', () => {
    const label = dayCarouselLabel('2026-06-16', 1, 'en', 'Today');
    expect(label).toMatch(/Tue/i);
  });
});
