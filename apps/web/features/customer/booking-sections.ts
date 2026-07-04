import { BOOKING_STATUS, type CustomerBookingListItem } from '@ikaro/types';

export interface BookingSections {
  readonly upcoming: CustomerBookingListItem[];
  readonly pending: CustomerBookingListItem[];
  readonly history: CustomerBookingListItem[];
}

const HISTORY_STATUSES: ReadonlySet<string> = new Set([
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.CANCELLED,
  BOOKING_STATUS.REJECTED,
]);

function startOfDay(date: Date): Date {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

function byScheduledAtAsc(a: CustomerBookingListItem, b: CustomerBookingListItem): number {
  return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
}

export function splitBookingSections(
  items: readonly CustomerBookingListItem[],
  now: Date = new Date(),
): BookingSections {
  const today = startOfDay(now);
  return {
    upcoming: items
      .filter((b) => b.status === BOOKING_STATUS.APPROVED && new Date(b.scheduledAt) >= today)
      .sort(byScheduledAtAsc),
    pending: items
      .filter(
        (b) => b.status === BOOKING_STATUS.PENDING || b.status === BOOKING_STATUS.INFO_REQUESTED,
      )
      .sort(byScheduledAtAsc),
    history: items
      .filter((b) => HISTORY_STATUSES.has(b.status))
      .sort((a, b) => byScheduledAtAsc(b, a)),
  };
}

/** Home preview: the next actionable bookings (upcoming APPROVED + pending), soonest first. */
export function selectHomePreview(
  items: readonly CustomerBookingListItem[],
  now: Date = new Date(),
  max = 3,
): CustomerBookingListItem[] {
  const { upcoming, pending } = splitBookingSections(items, now);
  return [...upcoming, ...pending].sort(byScheduledAtAsc).slice(0, max);
}

/** "Agendamentos" stat: APPROVED + COMPLETED bookings (resolved 2026-07-04). */
export function countActiveBookings(items: readonly CustomerBookingListItem[]): number {
  return items.filter(
    (b) => b.status === BOOKING_STATUS.APPROVED || b.status === BOOKING_STATUS.COMPLETED,
  ).length;
}

/**
 * UC-006 A2 — `cancellableUntil` is computed server-side from the tenant's cancellation
 * window and is non-null only for APPROVED bookings. PENDING/INFO_REQUESTED requests can
 * always be cancelled (UC-007 has no time restriction on them).
 */
export function canCancelBooking(item: CustomerBookingListItem, now: Date = new Date()): boolean {
  if (item.status === BOOKING_STATUS.PENDING || item.status === BOOKING_STATUS.INFO_REQUESTED) {
    return true;
  }
  if (item.status !== BOOKING_STATUS.APPROVED) return false;
  return item.cancellableUntil !== null && now < new Date(item.cancellableUntil);
}
