import { z } from 'zod';

// Zod's built-in ISO-date check is calendar-aware (leap years, 30/31-day months) — TD42. It is
// the single implementation of the "real YYYY-MM-DD calendar date" rule: request schemas use
// `z.iso.date()` directly (its `invalid_format`/`date` issue maps to
// CalendarDateErrorCode.FORMAT_INVALID in @ikaro/types' deriveViolation), and the backend
// CalendarDate VO delegates here.
const CALENDAR_DATE_SCHEMA = z.iso.date();

export function isValidCalendarDate(value: string): boolean {
  return CALENDAR_DATE_SCHEMA.safeParse(value).success;
}

const HHMM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimeOfDay(value: string): boolean {
  return HHMM_PATTERN.test(value);
}

export function isValidTimezone(value: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
