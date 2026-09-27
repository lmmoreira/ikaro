import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { RecurrenceRule } from '../../../contexts/booking/domain/recurrence-rule.helpers';
import { RecurringBookingScheduleCreated } from '../../../contexts/booking/domain/events/recurring-booking-schedule-created.event';

export class RecurringBookingScheduleCreatedEventBuilder {
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private correlationId = 'corr-1';
  private recurringScheduleId = uuidv7();
  private readonly customerId = uuidv7();
  private readonly serviceId = uuidv7();
  private readonly resourceIds: string[] = [uuidv7()];
  private readonly assignmentPolicy: 'FIXED_ASSIGNMENT' | 'RESOLVE_PER_OCCURRENCE' =
    'FIXED_ASSIGNMENT';
  private readonly recurrence: RecurrenceRule = {
    frequency: 'WEEKLY',
    daysOfWeek: ['tuesday'],
    startTime: '10:00',
    durationMinutes: 120,
  };
  private readonly startsOn = '2026-09-01';

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

  build(): RecurringBookingScheduleCreated {
    return new RecurringBookingScheduleCreated(this.tenantId, this.correlationId, {
      recurringScheduleId: this.recurringScheduleId,
      customerId: this.customerId,
      serviceId: this.serviceId,
      resourceIds: this.resourceIds,
      assignmentPolicy: this.assignmentPolicy,
      recurrence: this.recurrence,
      startsOn: this.startsOn,
    });
  }
}
