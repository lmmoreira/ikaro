import { DomainEvent } from '../../../../shared/domain/domain-event';
import { RecurrenceRule } from '../recurrence-rule.helpers';

interface RecurringBookingScheduleApprovalRequestedData extends Record<string, unknown> {
  recurringScheduleId: string;
  customerId: string;
  serviceId: string;
  resourceIds: string[];
  assignmentPolicy: 'FIXED_ASSIGNMENT' | 'RESOLVE_PER_OCCURRENCE';
  recurrence: RecurrenceRule;
  startsOn: string;
  endsOn: string;
  approvalHoldExpiresAt: string;
}

// docs/03-DOMAIN_EVENTS.md § RecurringBookingScheduleApprovalRequested — fired by
// RecurringBookingSchedule.request() when the service's effective approval mode is
// MANUAL_APPROVAL (UC-070 step 2).
export class RecurringBookingScheduleApprovalRequested extends DomainEvent<RecurringBookingScheduleApprovalRequestedData> {
  readonly eventVersion = 1;
  readonly data: RecurringBookingScheduleApprovalRequestedData;

  constructor(
    tenantId: string,
    correlationId: string,
    data: RecurringBookingScheduleApprovalRequestedData,
  ) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
