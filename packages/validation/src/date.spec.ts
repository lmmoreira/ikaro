import { DATE_ONLY_PATTERN, isValidTimeOfDay, isValidTimezone } from './date';

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

describe('isValidTimeOfDay', () => {
  it('accepts a valid HH:MM time', () => {
    expect(isValidTimeOfDay('09:30')).toBe(true);
    expect(isValidTimeOfDay('23:59')).toBe(true);
    expect(isValidTimeOfDay('00:00')).toBe(true);
  });

  it('rejects an hour past 23', () => {
    expect(isValidTimeOfDay('24:00')).toBe(false);
  });

  it('rejects a minute past 59', () => {
    expect(isValidTimeOfDay('12:60')).toBe(false);
  });

  it('rejects a non HH:MM shape', () => {
    expect(isValidTimeOfDay('9:30')).toBe(false);
    expect(isValidTimeOfDay('09:30:00')).toBe(false);
    expect(isValidTimeOfDay('not-a-time')).toBe(false);
  });
});

describe('isValidTimezone', () => {
  it('accepts a valid IANA timezone', () => {
    expect(isValidTimezone('America/Sao_Paulo')).toBe(true);
    expect(isValidTimezone('UTC')).toBe(true);
  });

  it('rejects a non-IANA timezone string', () => {
    expect(isValidTimezone('Not/AZone')).toBe(false);
    expect(isValidTimezone('')).toBe(false);
  });
});
