import { DomainEvent } from '../../../../shared/domain/domain-event';

interface RecurringBookingScheduleEndedData extends Record<string, unknown> {
  recurringScheduleId: string;
  customerId: string;
  serviceId: string;
  cancelledBookingIds: string[];
  // Who ended the schedule — drives the wording of the customer email (M23-S28).
  endedBy: 'CUSTOMER' | 'STAFF';
}

// docs/03-DOMAIN_EVENTS.md § RecurringBookingScheduleEnded (UC-070 A2) — Notification Context
// customer email.
export class RecurringBookingScheduleEnded extends DomainEvent<RecurringBookingScheduleEndedData> {
  readonly eventVersion = 1;
  readonly data: RecurringBookingScheduleEndedData;

  constructor(tenantId: string, correlationId: string, data: RecurringBookingScheduleEndedData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
