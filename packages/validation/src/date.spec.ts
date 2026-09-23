import { isValidCalendarDate, isValidTimeOfDay, isValidTimezone } from './date';

describe('isValidCalendarDate', () => {
  it.each(['2026-08-03', '2026-12-31', '2028-02-29', '2000-02-29'])('accepts %s', (value) => {
    expect(isValidCalendarDate(value)).toBe(true);
  });

  it.each([
    ['2026-02-30', 'day past the end of February'],
    ['2026-02-29', 'Feb 29 in a non-leap year'],
    ['1900-02-29', 'Feb 29 in a century year not divisible by 400'],
    ['2026-04-31', 'day 31 in a 30-day month'],
    ['2026-13-01', 'month 13'],
    ['2026-00-10', 'month 0'],
    ['2026-01-00', 'day 0'],
    ['2026-8-3', 'missing zero-padding'],
    ['2026/08/03', 'slashes instead of dashes'],
    ['2026-08-03T00:00:00.000Z', 'a full ISO datetime'],
    ['not-a-date', 'a non-numeric string'],
    ['', 'an empty string'],
  ])('rejects %s (%s)', (value) => {
    expect(isValidCalendarDate(value)).toBe(false);
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
