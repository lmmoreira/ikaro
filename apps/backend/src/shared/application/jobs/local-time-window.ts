import type { ActiveTenant } from '../../ports/tenant-directory.port';
import { utcDateToLocalHHMM } from '../../utils/calendar-date';

// A cron fires every 30 minutes, so a 30-minute window of the tenant's local day contains exactly
// one tick a day. Two jobs must never share a window by accident.
export interface LocalTimeWindow {
  readonly start: string;
  readonly end: string;
}

export function isInLocalWindow(now: Date, timezone: string, window: LocalTimeWindow): boolean {
  const localHHMM = utcDateToLocalHHMM(now, timezone);
  return localHHMM >= window.start && localHHMM <= window.end;
}

// The schedule policy of a windowed job, as a predicate the runner's `isDue` option takes.
export function localTimeWindow(
  window: LocalTimeWindow,
): (tenant: ActiveTenant, now: Date) => boolean {
  return (tenant, now) => isInLocalWindow(now, tenant.timezone, window);
}
