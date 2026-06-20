import { describe, expect, it } from 'vitest';
import { addDays, toISODate } from './date-utils';

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
