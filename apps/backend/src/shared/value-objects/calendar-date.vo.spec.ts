import { CalendarDateErrorCode } from '@ikaro/types';
import { todayUTC } from '../utils/calendar-date';
import { CalendarDate, CalendarDateValidationError } from './calendar-date.vo';

describe('CalendarDate', () => {
  it('accepts real calendar dates, including leap days', () => {
    expect(CalendarDate.isValid('2026-08-03')).toBe(true);
    expect(CalendarDate.isValid('2028-02-29')).toBe(true);
  });

  it('rejects shape-valid but calendar-impossible dates', () => {
    expect(CalendarDate.isValid('2026-02-30')).toBe(false);
    expect(CalendarDate.isValid('2026-02-29')).toBe(false);
    expect(CalendarDate.isValid('2026-13-01')).toBe(false);
  });

  it('rejects a malformed string', () => {
    expect(CalendarDate.isValid('2026-8-3')).toBe(false);
    expect(CalendarDate.isValid('')).toBe(false);
  });

  it('create returns the date unchanged', () => {
    expect(CalendarDate.create('2026-08-03').value).toBe('2026-08-03');
  });

  it('create throws CalendarDateValidationError with FORMAT_INVALID for an impossible date', () => {
    expect(() => CalendarDate.create('2026-02-30')).toThrow(CalendarDateValidationError);
    try {
      CalendarDate.create('2026-02-30');
    } catch (err) {
      expect((err as CalendarDateValidationError).code).toBe(CalendarDateErrorCode.FORMAT_INVALID);
    }
  });

  it('reconstitute skips validation', () => {
    expect(CalendarDate.reconstitute('2026-02-30').value).toBe('2026-02-30');
  });

  it('today returns the current UTC date', () => {
    expect(CalendarDate.today().value).toBe(todayUTC());
  });

  it('isBefore orders dates chronologically across month and year boundaries', () => {
    const dec31 = CalendarDate.create('2025-12-31');
    const jan01 = CalendarDate.create('2026-01-01');
    expect(dec31.isBefore(jan01)).toBe(true);
    expect(jan01.isBefore(dec31)).toBe(false);
    expect(jan01.isBefore(CalendarDate.create('2026-01-01'))).toBe(false);
  });

  it('toString returns the value', () => {
    expect(String(CalendarDate.create('2026-08-03'))).toBe('2026-08-03');
  });
});
