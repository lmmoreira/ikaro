import type { HotsiteServiceResponse, RecurringBookingScheduleListItem } from '@ikaro/types';
import { addIsoDays } from './booking-window';
import { type RecurringScheduleDraft } from './recurring-schedule-form';
import { choiceRequirements } from './recurring-requirements';
import { isRecurrenceEligibleService } from './recurring-service-eligibility';

// The pure pre-fill of a renewal: no React, no shell or my-account imports.

/**
 * The previous schedule's picks, matched to the service's `CUSTOMER_CHOICE` requirements by resource
 * type (a service has one requirement per type, so the stored pick of that type is the one). A
 * response from before `resourceAssignments` existed only has `resourceIds`, which is enough for a
 * single choice. A pick the form no longer offers is replaced by its first option there.
 */
function renewalPicks(
  schedule: RecurringBookingScheduleListItem,
  service: HotsiteServiceResponse,
): (string | null)[] {
  const choices = choiceRequirements(service);
  const stored = schedule.resourceAssignments;
  if (stored === undefined) {
    return choices.map((_, index) => (index === 0 ? (schedule.resourceIds?.[0] ?? null) : null));
  }
  return choices.map(
    (choice) =>
      stored.find((assignment) => assignment.resourceType === choice.type)?.resourceId ?? null,
  );
}

/**
 * The creation form's starting state for renewing `schedule`: same service, weekdays, time and (for
 * a fixed resource) resource; it starts the day after the old term ends, or `today` when that has
 * passed; the end date is left for the customer. Null when the schedule cannot be renewed (pending
 * or cancelled) or its service no longer allows recurrence, and the caller falls back to the blank
 * form.
 */
export function buildRenewalDraft(
  schedule: RecurringBookingScheduleListItem,
  services: readonly HotsiteServiceResponse[],
  today: string,
): RecurringScheduleDraft | null {
  if (schedule.status !== 'ACTIVE' && schedule.status !== 'ENDED') return null;
  const service = services.find((candidate) => candidate.id === schedule.serviceId);
  if (service === undefined || !isRecurrenceEligibleService(service)) return null;

  const dayAfterEnd = addIsoDays(schedule.endsOn, 1);
  return {
    serviceId: schedule.serviceId,
    resourceIds: renewalPicks(schedule, service),
    daysOfWeek: schedule.recurrence.daysOfWeek,
    startTime: schedule.recurrence.startTime,
    startsOn: dayAfterEnd > today ? dayAfterEnd : today,
    endsOn: '',
  };
}
