import {
  BookingErrorCode,
  type RecurringScheduleConflict,
  type RecurringScheduleConflictProblemDetail,
} from '@ikaro/types';
import { ApiError, extractProblemDetailShape } from '@/shared/lib/api/errors';

export type DecisionAction = 'approve' | 'reject';

// What a staff decision on a recurring-schedule request ended in (UC-071, drawn in 08b). Everything
// the screen shows after a click comes from one of these, so the banner, the action panel and the
// retry rules cannot disagree.
export type DecisionOutcome =
  | { readonly kind: 'approved'; readonly created: number }
  | { readonly kind: 'rejected' }
  // 409 …CONFLICT — an occurrence no longer passes the hours or occupancy check; nothing was created.
  | { readonly kind: 'conflict'; readonly conflicts: readonly RecurringScheduleConflict[] }
  // 422 …CUSTOMER_PHONE_NOT_SET — the occurrence bookings need a contact phone.
  | { readonly kind: 'phone' }
  // 422 …SCHEDULED_IN_PAST — every date started while the request waited.
  | { readonly kind: 'past' }
  // 422 …INELIGIBLE_SERVICE — the service was edited after the request.
  | { readonly kind: 'ineligible' }
  // 409 …NOT_PENDING_APPROVAL — someone else decided, or the hold expired.
  | { readonly kind: 'notPending' }
  // Anything else (network, 5xx, an unmapped code): nothing is known to have changed.
  | { readonly kind: 'failure'; readonly action: DecisionAction };

function readConflicts(error: unknown): readonly RecurringScheduleConflict[] {
  if (!(error instanceof ApiError)) return [];
  const data = error.data as Partial<RecurringScheduleConflictProblemDetail> | undefined;
  return Array.isArray(data?.conflicts) ? data.conflicts : [];
}

/**
 * Maps the error of an approve or reject call to the outcome the screen draws. The decision codes
 * are only meaningful for an approval; a reject can only be refused because the request is no
 * longer pending, so any other reject failure is a generic one.
 */
export function classifyDecisionError(error: unknown, action: DecisionAction): DecisionOutcome {
  const code = extractProblemDetailShape(error)?.code;

  if (code === BookingErrorCode.RECURRING_SCHEDULE_NOT_PENDING_APPROVAL) {
    return { kind: 'notPending' };
  }
  if (action === 'approve') {
    if (code === BookingErrorCode.RECURRING_SCHEDULE_CONFLICT) {
      return { kind: 'conflict', conflicts: readConflicts(error) };
    }
    if (code === BookingErrorCode.CUSTOMER_PHONE_NOT_SET) return { kind: 'phone' };
    if (code === BookingErrorCode.SCHEDULED_IN_PAST) return { kind: 'past' };
    if (code === BookingErrorCode.RECURRING_SCHEDULE_INELIGIBLE_SERVICE) {
      return { kind: 'ineligible' };
    }
  }
  return { kind: 'failure', action };
}

/** The request is settled (decided or gone): the screen offers only the way back to the Agenda. */
export function isSettledOutcome(outcome: DecisionOutcome | null): boolean {
  return (
    outcome !== null &&
    (outcome.kind === 'approved' || outcome.kind === 'rejected' || outcome.kind === 'notPending')
  );
}

/**
 * After a refusal the request is still pending. Re-approving can only work when the cause may have
 * changed (a date freed up, the phone was added, the network came back): not when every date has
 * passed or the service no longer qualifies, where only "Recusar" is useful.
 */
export function canRetryApproval(outcome: DecisionOutcome | null): boolean {
  if (outcome === null) return true;
  return outcome.kind === 'conflict' || outcome.kind === 'phone' || outcome.kind === 'failure';
}
