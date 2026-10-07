import type { HotsiteServiceResponse } from '@ikaro/types';
import { addDays, toISODate, toISODateInTimezone } from '@/shared/lib/formatting/date-utils';

const MS_PER_HOUR = 3_600_000;

export interface BookingWindow {
  readonly minAdvanceHours: number;
  readonly maxAdvanceDays: number;
}

// The backend resolves each service's effective window (its override clamped to the tenant's), so
// a basket only has to take the strictest value per field — the smallest maximum, the largest
// minimum. `tenantMaxAdvanceDays` bounds an empty basket.
export function resolveBasketBookingWindow(
  services: readonly HotsiteServiceResponse[],
  tenantMaxAdvanceDays: number,
): BookingWindow {
  let minAdvanceHours = 0;
  let maxAdvanceDays = tenantMaxAdvanceDays;
  for (const { bookingPolicy } of services) {
    minAdvanceHours = Math.max(minAdvanceHours, bookingPolicy.effectiveMinBookingAdvanceHours);
    maxAdvanceDays = Math.min(maxAdvanceDays, bookingPolicy.effectiveMaxBookingAdvanceDays);
  }
  return { minAdvanceHours, maxAdvanceDays };
}

/** Adds whole calendar days to a YYYY-MM-DD date, with no timezone involved. */
export function addIsoDays(isoDate: string, days: number): string {
  return toISODate(addDays(new Date(`${isoDate}T00:00:00Z`), days));
}

/** The tenant-local calendar day of `now` — the backend's "today" for every booking-window rule. */
export function tenantToday(now: Date, timezone: string): string {
  return toISODateInTimezone(now, timezone);
}

/** The last tenant-local day a booking may start on: today + maxAdvanceDays − 1. */
export function lastBookableDate(now: Date, maxAdvanceDays: number, timezone: string): string {
  return addIsoDays(tenantToday(now, timezone), maxAdvanceDays - 1);
}

/** The first tenant-local day that can still hold a slot after the minimum notice. */
export function earliestBookableDate(now: Date, minAdvanceHours: number, timezone: string): string {
  return tenantToday(new Date(now.getTime() + minAdvanceHours * MS_PER_HOUR), timezone);
}

/** A slot is bookable when it starts after now and at least `minAdvanceHours` from now. */
export function isSlotBookable(startsAt: string, now: Date, minAdvanceHours: number): boolean {
  const start = Date.parse(startsAt);
  return start > now.getTime() && start >= now.getTime() + minAdvanceHours * MS_PER_HOUR;
}
