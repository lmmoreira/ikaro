import { DateTime } from 'luxon';

export type WeekDayName =
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday';

const WEEKDAY_NAMES: WeekDayName[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

/** Returns today's date as a YYYY-MM-DD string in UTC. */
export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Returns the UTC day-of-week name for a YYYY-MM-DD date string.
 * Uses UTC parsing to avoid local-timezone day shifts.
 */
export function getUtcWeekDayName(date: string): WeekDayName {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return WEEKDAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

/**
 * Converts a YYYY-MM-DD date + HH:MM time expressed in the given IANA timezone
 * to an ISO-8601 UTC string (e.g. "2026-06-01T12:00:00.000Z").
 * Use this when storing a locally-expressed slot start/end in the database.
 */
export function localDateTimeToUTCIso(date: string, time: string, timezone: string): string {
  return DateTime.fromISO(`${date}T${time}:00`, { zone: timezone }).toUTC().toISO()!;
}

/**
 * Converts a UTC Date to an HH:MM string in the given IANA timezone.
 * Use this when comparing a stored UTC booking time against local business-hour slots.
 */
export function utcDateToLocalHHMM(utcDate: Date, timezone: string): string {
  return DateTime.fromJSDate(utcDate, { zone: 'utc' }).setZone(timezone).toFormat('HH:mm');
}

/**
 * Converts a UTC Date to a YYYY-MM-DD date string in the given IANA timezone.
 * Use this when grouping stored UTC bookings by their local calendar date.
 */
export function utcDateToLocalDate(utcDate: Date, timezone: string): string {
  return DateTime.fromJSDate(utcDate, { zone: 'utc' }).setZone(timezone).toISODate()!;
}

/** Returns the ISO-8601 UTC start-of-day boundary for a YYYY-MM-DD string (00:00:00.000Z). */
export function startOfDayUTC(date: string): string {
  return `${date}T00:00:00.000Z`;
}

/** Returns the ISO-8601 UTC end-of-day boundary for a YYYY-MM-DD string (23:59:59.999Z). */
export function endOfDayUTC(date: string): string {
  return `${date}T23:59:59.999Z`;
}
