import type { HotsiteServiceResponse, RecurringBookingScheduleListItem } from '@ikaro/types';
import { addIsoDays } from './booking-window';
import {
  isRecurrenceEligibleService,
  requiresResourceChoice,
  type RecurringScheduleDraft,
} from './recurring-schedule-form';

// The pure pre-fill of a renewal: no React, no shell or my-account imports.

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
    resourceId: requiresResourceChoice(service) ? (schedule.resourceIds?.[0] ?? null) : null,
    daysOfWeek: schedule.recurrence.daysOfWeek,
    startTime: schedule.recurrence.startTime,
    startsOn: dayAfterEnd > today ? dayAfterEnd : today,
    endsOn: '',
  };
}
