import { daysBetweenUTC, todayInTimezone } from './calendar-date';

/**
 * The day-count half of the billing `bookableUntil` cap (M26-S18b), shared by Booking (the
 * pickers, the service windows, the alert matching) and Platform (the hotsite manifest), so both
 * clamp the same way. `bookableUntil` is `YYYY-MM-DD`: the first day the BOOKING feature no longer
 * applies, or `null` when no removal is pending.
 */

/**
 * Whole days from the tenant-local today to `bookableUntil`, floored at 0 (nothing bookable).
 * Today 10 Dec and `bookableUntil` 15 Dec give 5: the last bookable day is 14 Dec.
 */
export function daysUntilBookableUntil(
  bookableUntil: string,
  timezone: string,
  now: Date = new Date(),
): number {
  return Math.max(0, daysBetweenUTC(todayInTimezone(timezone, now), bookableUntil));
}

/** `maxAdvanceDays` clamped by the cap: `min(configured, days until bookableUntil)`. */
export function clampAdvanceDaysToBookableUntil(
  maxAdvanceDays: number,
  bookableUntil: string | null | undefined,
  timezone: string,
  now: Date = new Date(),
): number {
  if (!bookableUntil) return maxAdvanceDays;
  return Math.min(maxAdvanceDays, daysUntilBookableUntil(bookableUntil, timezone, now));
}
