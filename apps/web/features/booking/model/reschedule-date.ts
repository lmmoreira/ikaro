import { toISODateInTimezone } from '@/shared/lib/formatting/date-utils';
import { addIsoDays, earliestBookableDate, tenantToday } from './booking-window';

export const RESCHEDULE_CAROUSEL_DAYS = 14;

export interface InitialRescheduleDateParams {
  readonly currentStart: Date;
  readonly now: Date;
  readonly timezone: string;
  readonly window: { readonly minAdvanceHours: number; readonly maxAdvanceDays: number };
}

/**
 * The booking's own day, when the date strip actually offers it — otherwise null, so the slot list
 * never opens on a day the strip cannot show or the booking window would refuse.
 */
export function initialRescheduleDate({
  currentStart,
  now,
  timezone,
  window,
}: InitialRescheduleDateParams): string | null {
  const date = toISODateInTimezone(currentStart, timezone);
  const first = earliestBookableDate(now, window.minAdvanceHours, timezone);
  const span = Math.min(RESCHEDULE_CAROUSEL_DAYS, window.maxAdvanceDays);
  const last = addIsoDays(tenantToday(now, timezone), span - 1);

  return date >= first && date <= last ? date : null;
}
