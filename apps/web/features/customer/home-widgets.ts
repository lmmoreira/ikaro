import type { RecurringBookingScheduleListItem } from '@ikaro/types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The Início "Renovar" card: the one schedule ending first, or how many are ending when several are. */
export type RenewalSelection =
  | {
      readonly kind: 'one';
      readonly schedule: RecurringBookingScheduleListItem;
      readonly daysLeft: number;
    }
  | { readonly kind: 'many'; readonly count: number; readonly firstDaysLeft: number };

/** Whole days from one `YYYY-MM-DD` key to another; both are calendar days, so no zone is involved. */
function daysBetween(fromKey: string, toKey: string): number {
  return Math.round(
    (Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / MS_PER_DAY,
  );
}

/**
 * Picks what the card shows from the customer's running schedules. Which ones are "about to end" is
 * the server's call (`renewable`, from the tenant's renewal window, a setting a customer cannot
 * read), never recomputed here; a missing flag counts as not renewable. `today` is the tenant-local
 * day as `YYYY-MM-DD`, passed in so the selector never reads the clock.
 */
export function selectRenewalCandidate(
  schedules: readonly RecurringBookingScheduleListItem[],
  today: string,
): RenewalSelection | null {
  const renewable = schedules
    .filter((schedule) => schedule.status === 'ACTIVE' && schedule.renewable === true)
    .sort((a, b) => a.endsOn.localeCompare(b.endsOn));
  const [first] = renewable;
  if (first === undefined) return null;
  const daysLeft = Math.max(0, daysBetween(today, first.endsOn));
  if (renewable.length > 1)
    return { kind: 'many', count: renewable.length, firstDaysLeft: daysLeft };
  return { kind: 'one', schedule: first, daysLeft };
}
