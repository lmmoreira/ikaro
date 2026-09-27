import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { RecurrenceRule } from '../../../contexts/booking/domain/recurrence-rule.helpers';
import { RecurringBookingScheduleApprovalRequested } from '../../../contexts/booking/domain/events/recurring-booking-schedule-approval-requested.event';

export class RecurringBookingScheduleApprovalRequestedEventBuilder {
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private correlationId = 'corr-1';
  private recurringScheduleId = uuidv7();
  private customerId = uuidv7();
  private serviceId = uuidv7();
  private resourceIds: string[] = [uuidv7()];
  private assignmentPolicy: 'FIXED_ASSIGNMENT' | 'RESOLVE_PER_OCCURRENCE' = 'FIXED_ASSIGNMENT';
  private recurrence: RecurrenceRule = {
    frequency: 'WEEKLY',
    daysOfWeek: ['tuesday'],
    startTime: '10:00',
    durationMinutes: 120,
  };
  private startsOn = '2026-09-01';
  private approvalHoldExpiresAt = '2026-09-02T00:00:00.000Z';

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

  build(): RecurringBookingScheduleApprovalRequested {
    return new RecurringBookingScheduleApprovalRequested(this.tenantId, this.correlationId, {
      recurringScheduleId: this.recurringScheduleId,
      customerId: this.customerId,
      serviceId: this.serviceId,
      resourceIds: this.resourceIds,
      assignmentPolicy: this.assignmentPolicy,
      recurrence: this.recurrence,
      startsOn: this.startsOn,
      approvalHoldExpiresAt: this.approvalHoldExpiresAt,
    });
  }
}
