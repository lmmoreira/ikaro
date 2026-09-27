import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { RecurringBookingScheduleEntity } from '../../../contexts/booking/infrastructure/entities/recurring-booking-schedule.entity';
import {
  RecurringBookingScheduleAssignmentPolicy,
  RecurringBookingScheduleCancellationReason,
  RecurringBookingScheduleStatus,
} from '../../../contexts/booking/domain/recurring-booking-schedule.aggregate';
import { RecurrenceRule } from '../../../contexts/booking/domain/recurrence-rule.helpers';

export class RecurringBookingScheduleEntityBuilder {
  private id = uuidv7();
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private customerId = uuidv7();
  private serviceId = uuidv7();
  private recurrence: RecurrenceRule = {
    frequency: 'WEEKLY',
    daysOfWeek: ['tuesday'],
    startTime: '10:00',
    durationMinutes: 120,
  };
  private startsOn = '2026-09-01';
  private endsOn: string | null = null;
  private status: RecurringBookingScheduleStatus = 'ACTIVE';
  private assignmentPolicy: RecurringBookingScheduleAssignmentPolicy = 'FIXED_ASSIGNMENT';
  private approvalHoldExpiresAt: Date | null = null;
  private approvedByStaffId: string | null = null;
  private approvedAt: Date | null = null;
  private cancellationReason: RecurringBookingScheduleCancellationReason | null = null;
  private createdByStaffId: string | null = null;
  private readonly createdAt = new Date();
  private readonly updatedAt = new Date();

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withCustomerId(customerId: string): this {
    this.customerId = customerId;
    return this;
  }

  withServiceId(serviceId: string): this {
    this.serviceId = serviceId;
    return this;
  }

  withStatus(status: RecurringBookingScheduleStatus): this {
    this.status = status;
    return this;
  }

  withAssignmentPolicy(assignmentPolicy: RecurringBookingScheduleAssignmentPolicy): this {
    this.assignmentPolicy = assignmentPolicy;
    return this;
  }

  withApprovalHoldExpiresAt(approvalHoldExpiresAt: Date | null): this {
    this.approvalHoldExpiresAt = approvalHoldExpiresAt;
    return this;
  }

  build(): RecurringBookingScheduleEntity {
    const e = new RecurringBookingScheduleEntity();
    e.id = this.id;
    e.tenantId = this.tenantId;
    e.customerId = this.customerId;
    e.serviceId = this.serviceId;
    e.recurrence = this.recurrence;
    e.startsOn = this.startsOn;
    e.endsOn = this.endsOn;
    e.status = this.status;
    e.assignmentPolicy = this.assignmentPolicy;
    e.approvalHoldExpiresAt = this.approvalHoldExpiresAt;
    e.approvedByStaffId = this.approvedByStaffId;
    e.approvedAt = this.approvedAt;
    e.cancellationReason = this.cancellationReason;
    e.createdByStaffId = this.createdByStaffId;
    e.createdAt = this.createdAt;
    e.updatedAt = this.updatedAt;
    return e;
  }
}
