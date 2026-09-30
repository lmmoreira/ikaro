import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { RecurringBookingScheduleRejected } from '../../../contexts/booking/domain/events/recurring-booking-schedule-rejected.event';

export class RecurringBookingScheduleRejectedEventBuilder {
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private correlationId = 'corr-1';
  private recurringScheduleId = uuidv7();
  private readonly customerId = uuidv7();
  private readonly serviceId = uuidv7();
  private reason: 'APPROVAL_REJECTED' | 'APPROVAL_EXPIRED' = 'APPROVAL_REJECTED';

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.correlationId = correlationId;
    return this;
  }

  withRecurringScheduleId(recurringScheduleId: string): this {
    this.recurringScheduleId = recurringScheduleId;
    return this;
  }

  withReason(reason: 'APPROVAL_REJECTED' | 'APPROVAL_EXPIRED'): this {
    this.reason = reason;
    return this;
  }

  build(): RecurringBookingScheduleRejected {
    return new RecurringBookingScheduleRejected(this.tenantId, this.correlationId, {
      recurringScheduleId: this.recurringScheduleId,
      customerId: this.customerId,
      serviceId: this.serviceId,
      reason: this.reason,
    });
  }
}
