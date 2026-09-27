import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { RecurringBookingSchedulePaused } from '../../../contexts/booking/domain/events/recurring-booking-schedule-paused.event';

export class RecurringBookingSchedulePausedEventBuilder {
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private correlationId = 'corr-1';
  private recurringScheduleId = uuidv7();
  private customerId = uuidv7();
  private serviceId = uuidv7();

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

  build(): RecurringBookingSchedulePaused {
    return new RecurringBookingSchedulePaused(this.tenantId, this.correlationId, {
      recurringScheduleId: this.recurringScheduleId,
      customerId: this.customerId,
      serviceId: this.serviceId,
    });
  }
}
