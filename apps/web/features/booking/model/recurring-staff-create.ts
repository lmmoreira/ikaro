import {
  BookingErrorCode,
  type CreateRecurringBookingScheduleRequest,
  type CreateRecurringBookingScheduleResponse,
  type HotsiteServiceResponse,
} from '@ikaro/types';
import { ApiError } from '@/shared/lib/api/errors';
import {
  buildCreateRequest,
  findFirstOccurrence,
  mapCreateFailure,
  type CreateOutcome,
  type FirstOccurrenceIssue,
  type RecurringScheduleDraft,
} from './recurring-schedule-form';

// The staff side of "new recurring reservation" (UC-070, M23-S19). It layers on the customer form's
// pure rules (`recurring-schedule-form.ts`) instead of copying them: the same pattern, the same
// request body plus the chosen `customerId`, the same outcomes plus the two a staff actor can meet.

/**
 * Staff are exempt from the minimum notice and the maximum days ahead (UC-070 A10), so only the two
 * rules the backend still applies to them are checked before sending: a term in which no chosen
 * weekday occurs, and a first occurrence that has already started. A start today is accepted.
 */
export function checkStaffFirstOccurrence(
  draft: RecurringScheduleDraft,
  now: Date,
  timezone: string,
): Extract<FirstOccurrenceIssue, 'NO_OCCURRENCES' | 'SCHEDULED_IN_PAST'> | null {
  const first = findFirstOccurrence(draft, timezone);
  if (first === null) return 'NO_OCCURRENCES';
  return first <= now ? 'SCHEDULED_IN_PAST' : null;
}

/** The customer form's body with the customer the staff member chose. */
export function buildStaffCreateRequest(
  draft: RecurringScheduleDraft,
  service: HotsiteServiceResponse,
  customerId: string,
): CreateRecurringBookingScheduleRequest {
  return { ...buildCreateRequest(draft, service), customerId };
}

export type StaffCreateOutcome =
  | Exclude<CreateOutcome, { readonly kind: 'PENDING_APPROVAL' }>
  /** `404` `BOOKING_CUSTOMER_NOT_FOUND`: the customer is not in this business (`09c #cliente`). */
  | { readonly kind: 'CUSTOMER_NOT_FOUND' }
  /** `422` `BOOKING_CUSTOMER_PHONE_NOT_SET` (UC-070 A12): the customer has no phone (`09c #telefone`). */
  | { readonly kind: 'PHONE_NOT_SET' };

/**
 * A staff member's schedule is created `ACTIVE` whatever the service's approval policy (they are
 * the approver). A `PENDING_APPROVAL` answer would break that contract, so it is shown as a failure
 * rather than as a state the screen has no panel for.
 */
export function mapStaffCreateSuccess(
  response: CreateRecurringBookingScheduleResponse,
): StaffCreateOutcome {
  return response.status === 'ACTIVE'
    ? { kind: 'ACTIVE', schedule: response }
    : { kind: 'FAILURE' };
}

/** Maps a failed `POST` to its screen. Branches on the wire `code` only, never on the message text. */
export function mapStaffCreateFailure(error: unknown): StaffCreateOutcome {
  if (error instanceof ApiError) {
    const code = (error.data as { code?: unknown } | undefined)?.code;
    if (code === BookingErrorCode.CUSTOMER_NOT_FOUND) return { kind: 'CUSTOMER_NOT_FOUND' };
    if (code === BookingErrorCode.CUSTOMER_PHONE_NOT_SET) return { kind: 'PHONE_NOT_SET' };
  }
  const outcome = mapCreateFailure(error);
  // mapCreateFailure never returns the two success kinds; narrow for the compiler.
  return outcome.kind === 'ACTIVE' || outcome.kind === 'PENDING_APPROVAL'
    ? { kind: 'FAILURE' }
    : outcome;
}
