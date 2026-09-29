import { DomainEvent } from '../../../../shared/domain/domain-event';
import { RecurrenceRule } from '../recurrence-rule.helpers';

interface RecurringBookingScheduleCreatedData extends Record<string, unknown> {
  recurringScheduleId: string;
  customerId: string;
  serviceId: string;
  resourceIds: string[];
  assignmentPolicy: 'FIXED_ASSIGNMENT' | 'RESOLVE_PER_OCCURRENCE';
  recurrence: RecurrenceRule;
  startsOn: string;
  endsOn: string;
}

// docs/03-DOMAIN_EVENTS.md § RecurringBookingScheduleCreated — fired by RecurringBookingSchedule
// .request() when the service's effective approval mode is AUTO_CONFIRM (UC-070 step 2). M23-S05
// also fires this on UC-071 approval of a PENDING_APPROVAL request.
export class RecurringBookingScheduleCreated extends DomainEvent<RecurringBookingScheduleCreatedData> {
  readonly eventVersion = 1;
  readonly data: RecurringBookingScheduleCreatedData;

  constructor(tenantId: string, correlationId: string, data: RecurringBookingScheduleCreatedData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
