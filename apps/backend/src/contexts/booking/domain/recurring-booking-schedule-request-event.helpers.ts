import { RecurringBookingScheduleApprovalRequested } from './events/recurring-booking-schedule-approval-requested.event';
import { RecurringBookingScheduleCreated } from './events/recurring-booking-schedule-created.event';
import {
  RecurringBookingScheduleResourceAssignmentProps,
  RequestRecurringBookingScheduleOptions,
} from './recurring-booking-schedule.types';

// Split out of recurring-booking-schedule.aggregate.ts to keep that file under the file-length cap
// (same rationale as recurring-booking-schedule.types.ts's own split) — pure event-construction
// logic with no aggregate instance state, called once from RecurringBookingSchedule.request().
export function buildRequestedEvent(
  options: RequestRecurringBookingScheduleOptions,
  id: string,
  resourceAssignments: RecurringBookingScheduleResourceAssignmentProps[],
): RecurringBookingScheduleCreated | RecurringBookingScheduleApprovalRequested {
  const resourceIds = resourceAssignments.map((a) => a.resourceId);
  if (options.status === 'ACTIVE') {
    return new RecurringBookingScheduleCreated(options.tenantId, options.correlationId, {
      recurringScheduleId: id,
      customerId: options.customerId,
      serviceId: options.serviceId,
      resourceIds,
      assignmentPolicy: options.assignmentPolicy,
      recurrence: options.recurrence,
      startsOn: options.startsOn,
    });
  }
  return new RecurringBookingScheduleApprovalRequested(options.tenantId, options.correlationId, {
    recurringScheduleId: id,
    customerId: options.customerId,
    serviceId: options.serviceId,
    resourceIds,
    assignmentPolicy: options.assignmentPolicy,
    recurrence: options.recurrence,
    startsOn: options.startsOn,
    approvalHoldExpiresAt: options.approvalHoldExpiresAt!.toISOString(),
  });
}
