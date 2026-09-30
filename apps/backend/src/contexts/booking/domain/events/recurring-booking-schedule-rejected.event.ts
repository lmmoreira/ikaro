import { DomainEvent } from '../../../../shared/domain/domain-event';

interface RecurringBookingScheduleRejectedData extends Record<string, unknown> {
  recurringScheduleId: string;
  customerId: string;
  serviceId: string;
  reason: 'APPROVAL_REJECTED' | 'APPROVAL_EXPIRED';
}

// docs/03-DOMAIN_EVENTS.md § RecurringBookingScheduleRejected — a pending request that staff
// rejected (UC-071) or that reached its hold deadline unresolved (UC-070 A5).
export class RecurringBookingScheduleRejected extends DomainEvent<RecurringBookingScheduleRejectedData> {
  readonly eventVersion = 1;
  readonly data: RecurringBookingScheduleRejectedData;

  constructor(tenantId: string, correlationId: string, data: RecurringBookingScheduleRejectedData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
