import {
  getUtcWeekDayName,
  localDateTimeToUTCIso,
  WeekDayName,
} from '../../../shared/utils/calendar-date';

// WEEKLY-only for MVP (locked in during M23-S04 story-discovery, 2026-09-27) — one shared
// time-of-day across every listed weekday, no per-day override, no other frequency value.
// docs/02-DOMAIN_MODEL.md § RecurringBookingSchedule.
export interface RecurrenceRule {
  frequency: 'WEEKLY';
  daysOfWeek: WeekDayName[];
  startTime: string; // HH:mm, tenant-local
  durationMinutes: number;
}

// Platform default when Service.bookingPolicy.recurringHorizonDays is null — shared by M23-S04's
// creation-time conflict check and M23-S05's generation job (docs/02-DOMAIN_MODEL.md).
export const DEFAULT_RECURRING_HORIZON_DAYS = 90;

export interface RecurrenceOccurrence {
  // UTC instant the occurrence starts at.
  occurrenceStart: Date;
  // YYYY-MM-DD, the tenant-local calendar date the occurrence falls on — the natural key used by
  // recurring_booking_schedule_exceptions.occurrence_start and the generation job's idempotency
  // check (M23-S05).
  occurrenceStartLocalDate: string;
}

// A calendar date string's day-of-week is invariant to timezone (Sept 27, 2026 is a Sunday
// everywhere) — only the corresponding UTC instant shifts. So calendar-date.ts's UTC-anchored
// getUtcWeekDayName() is safe here for weekday lookup, even though startsOn/endsOn/horizonEnd are
// tenant-local calendar dates; only the actual occurrence instant (below) needs a real timezone
// conversion.
function addDaysToLocalDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

// Adds `horizonDays` calendar days to `startsOn` — the creation-time conflict-check horizon
// (M23-S04) and the rolling-horizon generation job's own horizon (M23-S05) must both be computed
// this same way, from the same Service.bookingPolicy.recurringHorizonDays value, or a schedule
// checked conflict-free at creation could still collide with what generation later materializes.
export function resolveHorizonEndDate(startsOn: string, horizonDays: number): string {
  return addDaysToLocalDate(startsOn, horizonDays);
}

// Enumerates every occurrence start implied by `recurrence` within [startsOn, horizonEnd],
// clipped by `endsOn` when set — shared by M23-S04's creation-time conflict check and M23-S05's
// generation job (docs/02-DOMAIN_MODEL.md § RecurringBookingSchedule). Both stories import this
// same function rather than each re-deriving the enumeration, so they can never silently disagree
// about what "conflict-free" means. All three date bounds are tenant-local calendar dates
// (YYYY-MM-DD), both inclusive; `horizonEnd` is expected to already be clipped to a sane ceiling
// (resolveHorizonEndDate) by the caller.
export function enumerateRecurrenceOccurrences(
  recurrence: RecurrenceRule,
  startsOn: string,
  endsOn: string | null,
  horizonEnd: string,
  timezone: string,
): RecurrenceOccurrence[] {
  const effectiveEnd = endsOn !== null && endsOn < horizonEnd ? endsOn : horizonEnd;
  if (effectiveEnd < startsOn) return [];

  const occurrences: RecurrenceOccurrence[] = [];
  let cursor = startsOn;
  while (cursor <= effectiveEnd) {
    if (recurrence.daysOfWeek.includes(getUtcWeekDayName(cursor))) {
      occurrences.push({
        occurrenceStart: new Date(localDateTimeToUTCIso(cursor, recurrence.startTime, timezone)),
        occurrenceStartLocalDate: cursor,
      });
    }
    cursor = addDaysToLocalDate(cursor, 1);
  }
  return occurrences;
}
