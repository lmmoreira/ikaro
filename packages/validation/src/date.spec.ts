import { DATE_ONLY_PATTERN } from './date';

describe('DATE_ONLY_PATTERN', () => {
  it('accepts a valid YYYY-MM-DD date', () => {
    expect(DATE_ONLY_PATTERN.test('2026-08-03')).toBe(true);
  });

  it('rejects a date missing zero-padding', () => {
    expect(DATE_ONLY_PATTERN.test('2026-8-3')).toBe(false);
  });

  it('rejects a date with slashes instead of dashes', () => {
    expect(DATE_ONLY_PATTERN.test('2026/08/03')).toBe(false);
  });

  it('rejects a full ISO datetime string', () => {
    expect(DATE_ONLY_PATTERN.test('2026-08-03T00:00:00.000Z')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(DATE_ONLY_PATTERN.test('')).toBe(false);
  });
});
