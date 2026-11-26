import { daysUntilBookableUntil } from '../../../../shared/utils/bookable-until-days';
import { localDateStartUTC } from '../../../../shared/utils/calendar-date';
import type { AvailabilityAlertCriteria } from '../../domain/availability-alert.types';
import { BookingTooFarAheadError } from '../../domain/errors/booking-domain.error';

/**
 * The billing `bookableUntil` cap (M26-S18b, UC-136 A11): once a removal of the BOOKING feature is
 * saved, no commitment may reach its effective date. `bookableUntil` is that date (`YYYY-MM-DD`,
 * the first day the feature no longer applies), or `null` when no removal is pending.
 *
 * It is a consistency rule, not a tenant preference, so it has no actor exemption: staff, managers
 * and the worklist are held to it like a customer. The tenant window
 * (`booking-window.helpers.ts`) stays a separate rule.
 */

/** The instant the cap starts to apply: the local midnight that opens `bookableUntil`. */
export function bookableUntilBoundary(bookableUntil: string, timezone: string): Date {
  return localDateStartUTC(bookableUntil, timezone);
}

/**
 * Refuses a commitment whose END instant is after the local midnight that starts `bookableUntil`
 * (`422 BOOKING_TOO_FAR_AHEAD`). An end exactly at that midnight occupies nothing of the effective
 * day and is accepted, the same boundary as the removal guard (S18a), so nothing this accepts can
 * block the removal. `null` accepts everything: a tenant with no pending removal is unchanged.
 */
export function assertEndsWithinBookableUntil(
  endsAt: Date,
  bookableUntil: string | null | undefined,
  timezone: string,
  now: Date = new Date(),
): void {
  if (!bookableUntil) return;
  if (endsAt.getTime() > bookableUntilBoundary(bookableUntil, timezone).getTime()) {
    throw new BookingTooFarAheadError(daysUntilBookableUntil(bookableUntil, timezone, now));
  }
}

/** A booking's current end (`scheduledAt + totalDurationMins`), after a reschedule was applied. */
export function assertBookingEndsWithinBookableUntil(
  booking: { scheduledAt: Date; totalDurationMins: number },
  bookableUntil: string | null | undefined,
  timezone: string,
): void {
  assertEndsWithinBookableUntil(
    commitmentEnd(booking.scheduledAt, booking.totalDurationMins),
    bookableUntil,
    timezone,
  );
}

export interface RecurringTermForBookableUntil {
  // The schedule's `endsOn` (YYYY-MM-DD): the removal guard blocks a schedule with `endsOn >= date`.
  endsOn: string;
  lastOccurrenceStart: Date;
  durationMinutes: number;
}

/**
 * A recurring request is refused whole, never trimmed, when its term reaches the cap: both its
 * `endsOn` (the guard counts a schedule with `endsOn >= bookableUntil`) and the end of its last
 * occurrence (the guard counts the booking that runs past the boundary) must stay before it.
 */
export function assertTermWithinBookableUntil(
  term: RecurringTermForBookableUntil,
  bookableUntil: string | null | undefined,
  timezone: string,
  now: Date = new Date(),
): void {
  if (!bookableUntil) return;
  if (term.endsOn >= bookableUntil) {
    throw new BookingTooFarAheadError(daysUntilBookableUntil(bookableUntil, timezone, now));
  }
  assertEndsWithinBookableUntil(
    commitmentEnd(term.lastOccurrenceStart, term.durationMinutes),
    bookableUntil,
    timezone,
    now,
  );
}

/**
 * The last instant an availability alert can still match: a one-time range ends at its
 * `acceptableEndAt` (or the alert's expiry, whichever comes first); a weekly preference matches
 * until it expires. An alert holds no capacity, but a new one must not reach past the effective
 * date (UC-136 A11), so create and update refuse it the same way as a commitment.
 */
export function alertLastMatchableInstant(
  criteria: AvailabilityAlertCriteria,
  expiresAt: Date,
): Date {
  if (criteria.criteriaType === 'ONE_TIME_RANGE') {
    return new Date(Math.min(criteria.acceptableEndAt.getTime(), expiresAt.getTime()));
  }
  return expiresAt;
}

/** The end instant of a commitment that starts at `startsAt` and runs `durationMins` minutes. */
export function commitmentEnd(startsAt: Date, durationMins: number): Date {
  return new Date(startsAt.getTime() + durationMins * 60_000);
}
