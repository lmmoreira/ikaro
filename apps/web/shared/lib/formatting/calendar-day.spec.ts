import { describe, expect, it } from 'vitest';
import { localDateFromISO, toLocalISODate, utcDateFromISO } from './calendar-day';

describe('calendar-day', () => {
  it('round-trips a day through local midnight whatever the runtime offset is', () => {
    expect(toLocalISODate(localDateFromISO('2026-10-20'))).toBe('2026-10-20');
    expect(toLocalISODate(localDateFromISO('2026-01-01'))).toBe('2026-01-01');
    expect(toLocalISODate(localDateFromISO('2026-12-31'))).toBe('2026-12-31');
  });

  it('builds local midnight for the Calendar, not UTC midnight', () => {
    const date = localDateFromISO('2026-10-20');

    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 9, 20]);
    expect([date.getHours(), date.getMinutes(), date.getSeconds()]).toEqual([0, 0, 0]);
  });

  it('builds UTC midnight for labels', () => {
    expect(utcDateFromISO('2026-10-20').toISOString()).toBe('2026-10-20T00:00:00.000Z');
  });

  it('zero-pads month and day', () => {
    expect(toLocalISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
