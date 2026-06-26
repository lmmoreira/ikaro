import { describe, expect, it } from 'vitest';
import { addDays, isSameDay, toDateKey } from './date-utils';

describe('toDateKey', () => {
  it('returns YYYY-MM-DD slice of ISO string', () => {
    expect(toDateKey(new Date('2026-06-26T14:30:00.000Z'))).toBe('2026-06-26');
  });

  it('handles midnight UTC', () => {
    expect(toDateKey(new Date('2026-01-01T00:00:00.000Z'))).toBe('2026-01-01');
  });
});

describe('addDays', () => {
  it('adds positive days', () => {
    const base = new Date('2026-06-26T00:00:00');
    expect(toDateKey(addDays(base, 7))).toBe('2026-07-03');
  });

  it('subtracts days when negative', () => {
    const base = new Date('2026-06-26T00:00:00');
    expect(toDateKey(addDays(base, -1))).toBe('2026-06-25');
  });

  it('does not mutate the input', () => {
    const base = new Date('2026-06-26T00:00:00');
    const original = base.getTime();
    addDays(base, 5);
    expect(base.getTime()).toBe(original);
  });
});

describe('isSameDay', () => {
  it('returns true for same date at different times', () => {
    const a = new Date('2026-06-26T08:00:00');
    const b = new Date('2026-06-26T23:59:59');
    expect(isSameDay(a, b)).toBe(true);
  });

  it('returns false for adjacent days', () => {
    const a = new Date('2026-06-26T00:00:00');
    const b = new Date('2026-06-27T00:00:00');
    expect(isSameDay(a, b)).toBe(false);
  });
});
