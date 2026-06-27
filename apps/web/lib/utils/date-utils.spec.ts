import { describe, expect, it } from 'vitest';
import { addDays, inWindow, isSameDay, toDateKey, toDateKeyInTimezone } from './date-utils';

describe('toDateKey', () => {
  it('returns YYYY-MM-DD slice of ISO string', () => {
    expect(toDateKey(new Date('2026-06-26T14:30:00.000Z'))).toBe('2026-06-26');
  });

  it('handles midnight UTC', () => {
    expect(toDateKey(new Date('2026-01-01T00:00:00.000Z'))).toBe('2026-01-01');
  });
});

describe('toDateKeyInTimezone', () => {
  it('returns the date in the given timezone', () => {
    // 2026-06-27T01:00:00Z = 2026-06-26T22:00:00 in America/Sao_Paulo (UTC-3)
    expect(toDateKeyInTimezone(new Date('2026-06-27T01:00:00.000Z'), 'America/Sao_Paulo')).toBe(
      '2026-06-26',
    );
  });

  it('returns the same date when time is mid-day UTC', () => {
    expect(toDateKeyInTimezone(new Date('2026-06-26T14:00:00.000Z'), 'America/Sao_Paulo')).toBe(
      '2026-06-26',
    );
  });
});

describe('addDays', () => {
  it('adds positive days', () => {
    const base = new Date('2026-06-26T00:00:00.000Z');
    expect(toDateKey(addDays(base, 7))).toBe('2026-07-03');
  });

  it('subtracts days when negative', () => {
    const base = new Date('2026-06-26T00:00:00.000Z');
    expect(toDateKey(addDays(base, -1))).toBe('2026-06-25');
  });

  it('does not mutate the input', () => {
    const base = new Date('2026-06-26T00:00:00.000Z');
    const original = base.getTime();
    addDays(base, 5);
    expect(base.getTime()).toBe(original);
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
