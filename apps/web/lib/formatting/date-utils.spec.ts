import { describe, expect, it } from 'vitest';
import { addDays, dayCarouselLabel, dayNumber, toISODate } from './date-utils';

describe('toISODate', () => {
  it('formats a date as YYYY-MM-DD', () => {
    expect(toISODate(new Date(Date.UTC(2026, 5, 15)))).toBe('2026-06-15');
  });

  it('pads single-digit months and days', () => {
    expect(toISODate(new Date(Date.UTC(2026, 0, 5)))).toBe('2026-01-05');
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
