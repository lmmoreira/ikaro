import { addDaysToDateKey } from '@/features/booking/schedule/date-utils';
import { toISODateInTimezone } from '@/shared/lib/formatting/date-utils';

export interface BookingQueueWindow {
  readonly today: string;
  readonly tomorrow: string;
  readonly windowEnd: string;
}

export interface BookingQueueWindowInput {
  readonly now: Date;
  readonly timezone: string;
  readonly windowDays: number;
}

/**
 * The bookings queue's date keys, in the tenant's timezone.
 *
 * `today` is the tenant's calendar day at `now` — never the UTC date, which differs from it for
 * hours every day. `tomorrow` and `windowEnd` are then pure date-key arithmetic, so no key is
 * ever converted through the server's or the browser's clock.
 */
export function resolveBookingQueueWindow({
  now,
  timezone,
  windowDays,
}: BookingQueueWindowInput): BookingQueueWindow {
  const today = toISODateInTimezone(now, timezone);
  return {
    today,
    tomorrow: addDaysToDateKey(today, 1),
    windowEnd: addDaysToDateKey(today, windowDays - 1),
  };
}
