import {
  getUtcWeekDayName,
  utcDateToLocalDate,
  utcDateToLocalHHMM,
} from '../../shared/utils/calendar-date';
import { DEFAULT_TEST_BUSINESS_HOURS } from './business-hours-fixtures';

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function futureDate(daysAhead = 1): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

export function pastDate(daysAgo = 1): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// Returns the next future date whose UTC day-of-week matches utcDayOfWeek (0=Sun…6=Sat).
// weeksAhead=1 (default) returns the very next occurrence; weeksAhead=2 returns the one after, etc.
// The result depends only on today and the requested weekday, so two calls for different weekdays
// are NOT guaranteed to be in weekday order (on a Monday, nextWeekday(2) is tomorrow while
// nextWeekday(1) is 7 days away). When a spec needs related dates ("the day after", "a week later"),
// derive them from one anchor with addDays() instead of calling nextWeekday() once per weekday.
export function nextWeekday(utcDayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6, weeksAhead = 1): string {
  const d = new Date();
  const daysUntil = (utcDayOfWeek - d.getUTCDay() + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + daysUntil + (weeksAhead - 1) * 7);
  return d.toISOString().slice(0, 10);
}

// The default test tenant (TenantSettings.default(): America/Sao_Paulo, Monday–Saturday open,
// Sunday closed) refuses a booking on a closed day or outside its hours. These return a start the
// tenant is open for, so a spec that only needs "a valid booking time" never depends on today's
// weekday. 13:00Z is 10:00 in America/Sao_Paulo, inside every open day's hours.
const OPEN_SLOT_UTC_TIME = 'T13:00:00.000Z';

// The nth day after today (n >= 1) the default test tenant is open. Two different n are always two
// different dates, so specs that need separate days (to avoid contending for the same resource)
// pass separate n.
export function openDate(nthOpenDay = 1): string {
  const d = new Date();
  let remaining = nthOpenDay;
  do {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0) remaining -= 1;
  } while (remaining > 0);
  return d.toISOString().slice(0, 10);
}

export function openSlot(nthOpenDay = 1): string {
  return `${openDate(nthOpenDay)}${OPEN_SLOT_UTC_TIME}`;
}

// openSlot() with the wall-clock hour of the default test tenant (America/Sao_Paulo, UTC-3) chosen
// by the caller: hours 9–15 are inside every open day's hours for a 30-minute service. A specs's
// "two bookings at different times on one day" pass different hours.
export function openSlotAt(nthOpenDay: number, localHour: number): string {
  return `${openDate(nthOpenDay)}T${String(localHour + 3).padStart(2, '0')}:00:00.000Z`;
}

// The nth (0-based) half-hour start, at least 30 minutes from now, at which the default test tenant
// can take a booking whose window is 90 minutes (a 30-minute service with the 60-minute buffer the
// entity builders give it). For a spec that needs a booking soon, such as one inside the
// cancellation window: the tenant is closed for at most ~40 hours in a row, so with a 48-hour
// window the first of these is always inside it.
export function nextOpenInstant(skipSlots = 0): string {
  const { timezone } = DEFAULT_TEST_BUSINESS_HOURS;
  const stepMs = 30 * 60_000;
  const windowMs = 90 * 60_000;
  const first = Math.ceil((Date.now() + stepMs) / stepMs) * stepMs;
  let remaining = skipSlots;
  for (let at = first; ; at += stepMs) {
    const start = new Date(at);
    const day = DEFAULT_TEST_BUSINESS_HOURS[getUtcWeekDayName(utcDateToLocalDate(start, timezone))];
    if (!day) continue;
    const startsAt = utcDateToLocalHHMM(start, timezone);
    const endsAt = utcDateToLocalHHMM(new Date(at + windowMs), timezone);
    if (startsAt < day.open || endsAt > day.close || endsAt <= startsAt) continue;
    if (remaining-- === 0) return start.toISOString();
  }
}
