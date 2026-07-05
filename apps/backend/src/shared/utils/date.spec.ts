import { toDate } from './date';

describe('toDate', () => {
  it('returns the same Date instance when the value is already a Date', () => {
    const date = new Date('2026-07-05T10:00:00.000Z');

    expect(toDate(date)).toBe(date);
  });

  it('converts an ISO string into a Date', () => {
    const result = toDate('2026-07-05T10:00:00.000Z');

    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toBe('2026-07-05T10:00:00.000Z');
  });
});
