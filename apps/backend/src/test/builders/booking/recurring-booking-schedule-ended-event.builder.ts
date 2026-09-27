import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { RecurringBookingScheduleEnded } from '../../../contexts/booking/domain/events/recurring-booking-schedule-ended.event';

export class RecurringBookingScheduleEndedEventBuilder {
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private correlationId = 'corr-1';
  private recurringScheduleId = uuidv7();
  private readonly customerId = uuidv7();
  private readonly serviceId = uuidv7();
  private cancelledBookingIds: string[] = [];

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

  withCancelledBookingIds(cancelledBookingIds: string[]): this {
    this.cancelledBookingIds = cancelledBookingIds;
    return this;
  }

  build(): RecurringBookingScheduleEnded {
    return new RecurringBookingScheduleEnded(this.tenantId, this.correlationId, {
      recurringScheduleId: this.recurringScheduleId,
      customerId: this.customerId,
      serviceId: this.serviceId,
      cancelledBookingIds: this.cancelledBookingIds,
    });
  }
}
