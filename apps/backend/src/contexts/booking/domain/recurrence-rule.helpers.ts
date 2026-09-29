import {
  addDaysUTC,
  getUtcWeekDayName,
  localDateTimeToUTCIso,
  WeekDayName,
} from '../../../shared/utils/calendar-date';
import { TimeOfDay } from '../../../shared/value-objects/time-of-day.vo';
import {
  RecurringBookingScheduleInvalidDateRangeError,
  RecurringBookingScheduleTermExceededError,
} from './errors/recurring-booking-schedule.error';

// WEEKLY-only for MVP (locked in during M23-S04 story-discovery, 2026-09-27) — one shared
// time-of-day across every listed weekday, no per-day override, no other frequency value.
// docs/02-DOMAIN_MODEL.md § RecurringBookingSchedule.
export interface RecurrenceRule {
  frequency: 'WEEKLY';
  daysOfWeek: WeekDayName[];
  startTime: string; // HH:mm, tenant-local
  durationMinutes: number;
}

// Platform default when Service.bookingPolicy.recurringHorizonDays is null — the schedule's
// maximum term (docs/02-DOMAIN_MODEL.md § RecurringBookingSchedule).
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
// getUtcWeekDayName()/addDaysUTC() are safe here for weekday lookup and date-stepping, even
// though startsOn/endsOn/horizonEnd are tenant-local calendar dates; only the actual occurrence
// instant (below) needs a real timezone conversion.

// Adds `horizonDays` calendar days to `startsOn` — the latest `endsOn` a schedule may have (its
// maximum term, Service.bookingPolicy.recurringHorizonDays).
export function resolveHorizonEndDate(startsOn: string, horizonDays: number): string {
  return addDaysUTC(startsOn, horizonDays);
}

// A schedule is a fixed term, never open-ended: `endsOn` must satisfy
// startsOn <= endsOn <= startsOn + maxTermDays (an equal date is allowed). A reversed range and an
// over-long term are distinct errors because one translated message cannot say both. Called by
// the aggregate (the invariant) and by the request use case before it enumerates the term, so a
// far-future endsOn is refused before any per-occurrence work.
export function assertValidTerm(startsOn: string, endsOn: string, maxTermDays: number): void {
  if (endsOn < startsOn) throw new RecurringBookingScheduleInvalidDateRangeError();
  const latestEndsOn = resolveHorizonEndDate(startsOn, maxTermDays);
  if (endsOn > latestEndsOn) {
    throw new RecurringBookingScheduleTermExceededError(maxTermDays, latestEndsOn);
  }
}

// Enumerates every occurrence start implied by `recurrence` within the whole term
// [startsOn, endsOn] — the one enumeration shared by the creation-time checks and the
// materialization of the term (docs/02-DOMAIN_MODEL.md § RecurringBookingSchedule), so nothing
// checked at creation can diverge from what is materialized. Both bounds are tenant-local
// calendar dates (YYYY-MM-DD), inclusive; the caller has already validated the term
// (assertValidTerm).
export function enumerateRecurrenceOccurrences(
  recurrence: RecurrenceRule,
  startsOn: string,
  endsOn: string,
  timezone: string,
): RecurrenceOccurrence[] {
  if (endsOn < startsOn) return [];

  const occurrences: RecurrenceOccurrence[] = [];
  let cursor = startsOn;
  while (cursor <= endsOn) {
    if (recurrence.daysOfWeek.includes(getUtcWeekDayName(cursor))) {
      occurrences.push({
        occurrenceStart: new Date(localDateTimeToUTCIso(cursor, recurrence.startTime, timezone)),
        occurrenceStartLocalDate: cursor,
      });
    }
    cursor = addDaysUTC(cursor, 1);
  }
  return occurrences;
}

export interface RecurrenceOverlapCandidate {
  recurrence: RecurrenceRule;
  startsOn: string;
  endsOn: string;
}

// Two WEEKLY recurring patterns conflict when they share at least one day-of-week, their daily
// time windows overlap, and their own date ranges overlap — independent of whether either
// pattern has ever materialized a real Booking. An ACTIVE schedule has zero materialized
// occurrences until M23-S05 materializes its term (docs/13-DATABASE_SCHEMA.md's
// not-yet-materialized-pattern protocol), so resource_occupancy alone can never catch two
// recurring schedules colliding on the same resource before then — this direct pattern
// comparison is the only mechanism that can.
export function schedulesOverlap(
  a: RecurrenceOverlapCandidate,
  b: RecurrenceOverlapCandidate,
): boolean {
  const sharesDay = a.recurrence.daysOfWeek.some((day) => b.recurrence.daysOfWeek.includes(day));
  if (!sharesDay) return false;

  const aStart = TimeOfDay.create(a.recurrence.startTime).toMinutes();
  const aEnd = aStart + a.recurrence.durationMinutes;
  const bStart = TimeOfDay.create(b.recurrence.startTime).toMinutes();
  const bEnd = bStart + b.recurrence.durationMinutes;
  if (aStart >= bEnd || bStart >= aEnd) return false;

  return a.startsOn <= b.endsOn && b.startsOn <= a.endsOn;
}
