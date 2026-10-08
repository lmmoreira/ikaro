import { addDaysUTC } from '../../../../shared/utils/calendar-date';
import { BookingScheduledInPastError } from '../../domain/errors/booking-domain.error';
import {
  RecurringBookingScheduleNoOccurrencesError,
  RecurringBookingScheduleNotFoundError,
} from '../../domain/errors/recurring-booking-schedule.error';
import {
  enumerateRecurrenceOccurrences,
  RecurrenceOccurrence,
  RecurrenceRule,
} from '../../domain/recurrence-rule.helpers';
import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import { Service } from '../../domain/service.aggregate';
import { IRecurringBookingScheduleRepository } from '../ports/recurring-booking-schedule-repository.port';
import {
  assertWithinBookingWindow,
  BookingWindow,
  resolveEffectiveBookingWindow,
} from './booking-window.helpers';
import type { RequestRecurringBookingScheduleUseCaseInput } from './request-recurring-booking-schedule.use-case';

// What a renewal is compared on: the request's own pattern and start (M23-S35).
export interface ScheduleStartCandidate {
  serviceId: string;
  recurrence: RecurrenceRule;
  startsOn: string;
}

// A request renews `previous` when it keeps the same routine (service, weekdays as a set, start
// time, duration) and starts no later than the day after `previous` ends — a renewal continues the
// customer's routine, so it skips the booking window. Anything that differs is not an error: the
// request is simply a new schedule and meets the window like one. The check never grants an
// exemption on its own; the caller has already proven `previous` is this customer's.
export function isRenewalOf(
  previous: RecurringBookingSchedule,
  next: ScheduleStartCandidate,
): boolean {
  const before = previous.recurrence;
  const after = next.recurrence;
  return (
    previous.serviceId === next.serviceId &&
    before.startTime === after.startTime &&
    before.durationMinutes === after.durationMinutes &&
    hasSameWeekdays(before.daysOfWeek, after.daysOfWeek) &&
    next.startsOn <= addDaysUTC(previous.endsOn, 1)
  );
}

function hasSameWeekdays(a: readonly string[], b: readonly string[]): boolean {
  const first = new Set(a);
  const second = new Set(b);
  return first.size === second.size && [...first].every((day) => second.has(day));
}

// An occurrence that starts at or before `now` is never booked.
export function dropPastOccurrences(
  occurrences: RecurrenceOccurrence[],
  now: Date,
): RecurrenceOccurrence[] {
  return occurrences.filter(({ occurrenceStart }) => occurrenceStart > now);
}

export interface AssertScheduleStartParams {
  // Non-empty, in date order — the caller refuses an empty term first.
  occurrences: RecurrenceOccurrence[];
  now: Date;
  timezone: string;
  window: BookingWindow;
  // Staff and managers are exempt from the window on a customer's behalf, never from the past rule.
  enforceWindow: boolean;
}

// A new schedule starts where its first occurrence starts — an instant, the first start the
// recurrence really yields, never the `startsOn` date. Only that one is checked; the rest of the
// term is bounded by the service's maximum term, not by the maximum days ahead.
export function assertScheduleStart(params: AssertScheduleStartParams): void {
  const { occurrences, now, timezone, window, enforceWindow } = params;
  const startsAt = occurrences[0].occurrenceStart;
  if (enforceWindow) {
    assertWithinBookingWindow({ startsAt, now, timezone, window });
  } else if (startsAt <= now) {
    throw new BookingScheduledInPastError();
  }
}

export interface StartableOccurrencesContext {
  input: RequestRecurringBookingScheduleUseCaseInput;
  // The customer the schedule is for — the actor, or the one a staff member acts for.
  customerId: string;
  service: Service;
}

// M23-S35 — where the schedule starts. A term with no occurrence is refused (nothing to book,
// nothing to window-check). A renewal of the customer's own previous schedule continues their
// routine, so it skips the window and books only what is still ahead; any other request is a new
// schedule whose first occurrence must be inside the booking window — staff on a customer's behalf
// are exempt from the window, never from the past rule. Pure computation plus one read of the
// reference, so it runs inside the same transaction as the service's row lock.
export async function resolveStartableOccurrences(
  scheduleRepo: IRecurringBookingScheduleRepository,
  context: StartableOccurrencesContext,
): Promise<RecurrenceOccurrence[]> {
  const { input, customerId, service } = context;
  // The one enumeration of the term, shared with the conflict check and the materialization.
  const occurrences = enumerateRecurrenceOccurrences(
    input.recurrence,
    input.startsOn,
    input.endsOn,
    input.timezone,
  );
  if (occurrences.length === 0) throw new RecurringBookingScheduleNoOccurrencesError();
  const now = new Date();

  if (input.renewsScheduleId) {
    const previous = await scheduleRepo.findById(input.renewsScheduleId, input.tenantId);
    // Another customer's schedule is "not found", never a 403: the existence of someone else's
    // schedule is not for this caller to learn.
    if (!previous || previous.customerId !== customerId) {
      throw new RecurringBookingScheduleNotFoundError(input.renewsScheduleId);
    }
    if (isRenewalOf(previous, input)) {
      const upcoming = dropPastOccurrences(occurrences, now);
      if (upcoming.length === 0) throw new BookingScheduledInPastError();
      return upcoming;
    }
  }

  assertScheduleStart({
    occurrences,
    now,
    timezone: input.timezone,
    window: resolveEffectiveBookingWindow(input.tenantBookingWindow, [service]),
    enforceWindow: input.actorType === 'CUSTOMER',
  });
  return occurrences;
}
