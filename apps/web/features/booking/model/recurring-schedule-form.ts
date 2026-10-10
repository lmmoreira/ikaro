import {
  BookingErrorCode,
  DEFAULT_RECURRING_HORIZON_DAYS,
  type CreateRecurringBookingScheduleRequest,
  type CreateRecurringBookingScheduleResponse,
  type HotsiteServiceResponse,
  type ProblemDetail,
  type RecurringScheduleConflict,
  type RecurringScheduleWeekday,
  type ValidationProblemDetail,
} from '@ikaro/types';
import { ApiError } from '@/shared/lib/api/errors';
import { addIsoDays, lastBookableDate, tenantToday } from './booking-window';
import { wallTimeToOffsetIso } from './zoned-time';

// The pure rules of the customer's "new recurring reservation" form (M23-S17). No React, no shell
// or my-account imports: the staff-side creation (M23-S19) reuses all of it.

export const RECURRING_WEEKDAYS: readonly RecurringScheduleWeekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

// Date.getUTCDay() order — Sunday first.
const UTC_DAY_TO_WEEKDAY: readonly RecurringScheduleWeekday[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

const MS_PER_HOUR = 3_600_000;

// ── Which services the form offers ──────────────────────────────────────────────────────────────

/**
 * Mirrors the backend's `assertServiceEligible()`: a recurrence-eligible appointment service with
 * no legs, exactly one resource requirement of quantity 1, and a fixed duration. The backend stays
 * the authority — a service this lets through but the backend refuses ends in the generic failure.
 */
export function isRecurrenceEligibleService(service: HotsiteServiceResponse): boolean {
  const [requirement] = service.resourceRequirements;
  return (
    service.bookingPolicy.recurrenceEligible &&
    service.bookingModel === 'APPOINTMENT' &&
    (service.legs === null || service.legs.length === 0) &&
    service.resourceRequirements.length === 1 &&
    requirement?.requiredQuantity === 1 &&
    service.bookingPolicy.durationPolicy !== 'CUSTOMER_SELECTED'
  );
}

export function filterRecurrenceEligibleServices(
  services: readonly HotsiteServiceResponse[],
): HotsiteServiceResponse[] {
  return services.filter(isRecurrenceEligibleService);
}

/** Only a `CUSTOMER_CHOICE` requirement shows the resource control (and becomes FIXED_ASSIGNMENT). */
export function requiresResourceChoice(service: HotsiteServiceResponse): boolean {
  return service.resourceRequirements[0]?.selectionMode === 'CUSTOMER_CHOICE';
}

/** The schedule's maximum term in days: the service's own, else the platform default. */
export function resolveMaxTermDays(service: HotsiteServiceResponse): number {
  return service.bookingPolicy.recurringHorizonDays ?? DEFAULT_RECURRING_HORIZON_DAYS;
}

/** The latest `endsOn` the service allows for a schedule starting on `startsOn`. */
export function latestEndsOn(startsOn: string, service: HotsiteServiceResponse): string {
  return addIsoDays(startsOn, resolveMaxTermDays(service));
}

// ── The typed pattern ───────────────────────────────────────────────────────────────────────────

export interface RecurringScheduleDraft {
  readonly serviceId: string;
  /** Set only for a `CUSTOMER_CHOICE` service. */
  readonly resourceId: string | null;
  readonly daysOfWeek: readonly RecurringScheduleWeekday[];
  readonly startTime: string; // HH:mm, tenant-local
  readonly startsOn: string; // YYYY-MM-DD, tenant-local
  readonly endsOn: string; // YYYY-MM-DD, tenant-local; '' until chosen
}

export type DraftIssue =
  | 'WEEKDAY_REQUIRED'
  | 'START_TIME_REQUIRED'
  | 'START_DATE_REQUIRED'
  | 'END_REQUIRED'
  | 'END_BEFORE_START'
  | 'TERM_EXCEEDED'
  | 'RESOURCE_REQUIRED';

/** The rules the backend really enforces, applied before sending. Empty means the draft can go. */
export function validateDraft(
  draft: RecurringScheduleDraft,
  service: HotsiteServiceResponse,
): DraftIssue[] {
  const issues: DraftIssue[] = [];
  if (draft.daysOfWeek.length === 0) issues.push('WEEKDAY_REQUIRED');
  if (draft.startTime === '') issues.push('START_TIME_REQUIRED');
  if (draft.startsOn === '') issues.push('START_DATE_REQUIRED');
  if (requiresResourceChoice(service) && draft.resourceId === null) {
    issues.push('RESOURCE_REQUIRED');
  }
  if (draft.endsOn === '') {
    issues.push('END_REQUIRED');
  } else if (draft.startsOn !== '') {
    if (draft.endsOn < draft.startsOn) issues.push('END_BEFORE_START');
    else if (draft.endsOn > latestEndsOn(draft.startsOn, service)) issues.push('TERM_EXCEEDED');
  }
  return issues;
}

// ── First occurrence against the booking window (the M23-S35 backstop) ─────────────────────────

export type FirstOccurrenceIssue =
  'NO_OCCURRENCES' | 'SCHEDULED_IN_PAST' | 'TOO_SOON' | 'TOO_FAR_AHEAD';

/**
 * The instant of the first occurrence: the first chosen weekday on or after `startsOn` (and not
 * after `endsOn`), at `startTime` in the tenant timezone. Null when no chosen weekday falls in the
 * term. A wall time that does not exist (the skipped hour of a DST change) is passed over.
 */
export function findFirstOccurrence(draft: RecurringScheduleDraft, timezone: string): Date | null {
  if (draft.startsOn === '' || draft.endsOn === '' || draft.startTime === '') return null;
  const chosen = new Set(draft.daysOfWeek);
  for (let date = draft.startsOn; date <= draft.endsOn; date = addIsoDays(date, 1)) {
    const weekday = UTC_DAY_TO_WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()];
    if (weekday === undefined || !chosen.has(weekday)) continue;
    const iso = wallTimeToOffsetIso(`${date}T${draft.startTime}`, timezone);
    if (iso !== null) return new Date(iso);
  }
  return null;
}

/**
 * The same rule as the backend's `assertWithinBookingWindow()` on the first occurrence: in the
 * future, after the minimum notice, and no later than the last bookable day (`today +
 * maxAdvanceDays − 1` in the tenant timezone).
 */
export function checkFirstOccurrence(
  draft: RecurringScheduleDraft,
  service: HotsiteServiceResponse,
  now: Date,
  timezone: string,
): FirstOccurrenceIssue | null {
  const first = findFirstOccurrence(draft, timezone);
  if (first === null) return 'NO_OCCURRENCES';
  if (first <= now) return 'SCHEDULED_IN_PAST';
  const { effectiveMinBookingAdvanceHours, effectiveMaxBookingAdvanceDays } = service.bookingPolicy;
  if (first.getTime() < now.getTime() + effectiveMinBookingAdvanceHours * MS_PER_HOUR) {
    return 'TOO_SOON';
  }
  const lastDate = lastBookableDate(now, effectiveMaxBookingAdvanceDays, timezone);
  if (tenantToday(first, timezone) > lastDate) return 'TOO_FAR_AHEAD';
  return null;
}

/** How many reservations the pattern creates: every chosen weekday from `startsOn` to `endsOn`. */
export function countOccurrences(draft: RecurringScheduleDraft): number {
  if (draft.startsOn === '' || draft.endsOn === '') return 0;
  const chosen = new Set(draft.daysOfWeek);
  let count = 0;
  for (let date = draft.startsOn; date <= draft.endsOn; date = addIsoDays(date, 1)) {
    const weekday = UTC_DAY_TO_WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()];
    if (weekday !== undefined && chosen.has(weekday)) count += 1;
  }
  return count;
}

/** The earliest start date the picker offers: today, on the tenant's calendar. */
export function earliestStartDate(now: Date, timezone: string): string {
  return tenantToday(now, timezone);
}

// ── The request ─────────────────────────────────────────────────────────────────────────────────

/** The exact `POST /recurring-booking-schedules` body: the policy follows the service's selection mode. */
export function buildCreateRequest(
  draft: RecurringScheduleDraft,
  service: HotsiteServiceResponse,
): CreateRecurringBookingScheduleRequest {
  const resourceId = requiresResourceChoice(service) ? draft.resourceId : null;
  return {
    serviceId: draft.serviceId,
    recurrence: {
      frequency: 'WEEKLY',
      daysOfWeek: RECURRING_WEEKDAYS.filter((day) => draft.daysOfWeek.includes(day)),
      startTime: draft.startTime,
      durationMinutes: service.durationMinutes,
    },
    assignmentPolicy: resourceId === null ? 'RESOLVE_PER_OCCURRENCE' : 'FIXED_ASSIGNMENT',
    ...(resourceId === null ? {} : { resourceIds: [resourceId] }),
    startsOn: draft.startsOn,
    endsOn: draft.endsOn,
  };
}

// ── Outcomes ────────────────────────────────────────────────────────────────────────────────────

/** `13e` state A: a refusal about the pattern itself, shown above the form with the pattern kept. */
export type PatternRefusal =
  | { readonly kind: 'END_BEFORE_START' }
  | { readonly kind: 'END_REQUIRED' }
  | {
      readonly kind: 'TERM_EXCEEDED';
      readonly maxTermDays: number | null;
      readonly latestEndsOn: string | null;
    }
  // A4 / A5: the first occurrence is outside the booking window / no weekday occurs in the term.
  // The message comes from errors.json under `code`.
  | { readonly kind: 'BOOKING_WINDOW'; readonly code: string }
  | { readonly kind: 'NO_OCCURRENCES'; readonly code: string };

const FIRST_OCCURRENCE_CODES: Record<FirstOccurrenceIssue, string> = {
  NO_OCCURRENCES: BookingErrorCode.RECURRING_SCHEDULE_NO_OCCURRENCES,
  SCHEDULED_IN_PAST: BookingErrorCode.SCHEDULED_IN_PAST,
  TOO_SOON: BookingErrorCode.TOO_SOON,
  TOO_FAR_AHEAD: BookingErrorCode.TOO_FAR_AHEAD,
};

/** The same notice the backend's 422 would produce, shown before anything is sent. */
export function refusalForFirstOccurrence(issue: FirstOccurrenceIssue): PatternRefusal {
  const code = FIRST_OCCURRENCE_CODES[issue];
  return issue === 'NO_OCCURRENCES'
    ? { kind: 'NO_OCCURRENCES', code }
    : { kind: 'BOOKING_WINDOW', code };
}

export type CreateOutcome =
  | { readonly kind: 'ACTIVE'; readonly schedule: CreateRecurringBookingScheduleResponse }
  | { readonly kind: 'PENDING_APPROVAL'; readonly schedule: CreateRecurringBookingScheduleResponse }
  /** `06b` / `06d`; an empty list falls back to the translated generic message. */
  | { readonly kind: 'CONFLICT'; readonly conflicts: readonly RecurringScheduleConflict[] }
  | { readonly kind: 'CAP_REACHED' }
  | { readonly kind: 'PATTERN_REFUSED'; readonly refusal: PatternRefusal }
  /** Network, `5xx` and anything unexpected (including `INELIGIBLE_SERVICE`, unreachable by design). */
  | { readonly kind: 'FAILURE' };

export function mapCreateSuccess(response: CreateRecurringBookingScheduleResponse): CreateOutcome {
  return response.status === 'PENDING_APPROVAL'
    ? { kind: 'PENDING_APPROVAL', schedule: response }
    : { kind: 'ACTIVE', schedule: response };
}

const BOOKING_WINDOW_CODES: ReadonlySet<string> = new Set([
  BookingErrorCode.SCHEDULED_IN_PAST,
  BookingErrorCode.TOO_SOON,
  BookingErrorCode.TOO_FAR_AHEAD,
]);

type FailureBody = Partial<ProblemDetail> & {
  conflicts?: RecurringScheduleConflict[];
  violations?: ValidationProblemDetail['violations'];
};

function numberParam(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function stringParam(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function missingEndDate(body: FailureBody): boolean {
  return (body.violations ?? []).some((violation) => violation.field === 'endsOn');
}

function refusalFor(
  status: number,
  code: string | undefined,
  body: FailureBody,
): PatternRefusal | null {
  if (code === BookingErrorCode.RECURRING_SCHEDULE_INVALID_DATE_RANGE) {
    return { kind: 'END_BEFORE_START' };
  }
  if (code === BookingErrorCode.RECURRING_SCHEDULE_TERM_EXCEEDED) {
    return {
      kind: 'TERM_EXCEEDED',
      maxTermDays: numberParam(body.params?.maxTermDays),
      latestEndsOn: stringParam(body.params?.latestEndsOn),
    };
  }
  if (code === BookingErrorCode.RECURRING_SCHEDULE_NO_OCCURRENCES) {
    return { kind: 'NO_OCCURRENCES', code };
  }
  if (code !== undefined && BOOKING_WINDOW_CODES.has(code)) {
    return { kind: 'BOOKING_WINDOW', code };
  }
  if (status === 400 && missingEndDate(body)) return { kind: 'END_REQUIRED' };
  return null;
}

/** Maps a failed `POST` to its screen. Branches on the wire `code` only, never on the message text. */
export function mapCreateFailure(error: unknown): CreateOutcome {
  if (!(error instanceof ApiError)) return { kind: 'FAILURE' };
  const body = (error.data ?? {}) as FailureBody;
  const code = typeof body.code === 'string' ? body.code : undefined;

  if (code === BookingErrorCode.RECURRING_SCHEDULE_CONFLICT) {
    return { kind: 'CONFLICT', conflicts: Array.isArray(body.conflicts) ? body.conflicts : [] };
  }
  if (code === BookingErrorCode.RECURRING_SCHEDULE_CAP_REACHED) return { kind: 'CAP_REACHED' };

  const refusal = refusalFor(error.status, code, body);
  return refusal === null ? { kind: 'FAILURE' } : { kind: 'PATTERN_REFUSED', refusal };
}
