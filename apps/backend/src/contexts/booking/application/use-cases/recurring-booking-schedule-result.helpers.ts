import { RecurringBookingScheduleListItem } from '@ikaro/types';
import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';

// One mapping for a schedule as the API returns it, shared by the list and the by-id read so the
// two shapes cannot drift (the same split as toAvailabilityAlertResult for alerts). The wire type
// is the one definition in @ikaro/types.
export type RecurringBookingScheduleResult = RecurringBookingScheduleListItem;

export function toRecurringBookingScheduleResult(
  schedule: RecurringBookingSchedule,
  serviceName: string,
): RecurringBookingScheduleResult {
  return {
    id: schedule.id,
    customerId: schedule.customerId,
    serviceId: schedule.serviceId,
    serviceName,
    recurrence: schedule.recurrence,
    startsOn: schedule.startsOn,
    endsOn: schedule.endsOn,
    status: schedule.status,
    assignmentPolicy: schedule.assignmentPolicy,
    resourceIds: schedule.resourceAssignments.map((assignment) => assignment.resourceId),
    approvalHoldExpiresAt: schedule.approvalHoldExpiresAt?.toISOString() ?? null,
  };
}
