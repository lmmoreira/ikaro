import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { RecurrenceRule } from '../../domain/recurrence-rule.helpers';
import {
  RecurringBookingScheduleAssignmentPolicy,
  RecurringBookingScheduleCancellationReason,
  RecurringBookingScheduleStatus,
} from '../../domain/recurring-booking-schedule.aggregate';

// docs/13-DATABASE_SCHEMA.md § booking.recurring_booking_schedules (M23 Cluster 3).
@Entity('recurring_booking_schedules', { schema: 'booking' })
@Index(['tenantId'])
@Index(['tenantId', 'customerId', 'status'])
@Index(['tenantId', 'serviceId', 'status'])
@Index(['tenantId', 'status', 'approvalHoldExpiresAt'])
export class RecurringBookingScheduleEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ name: 'service_id', type: 'uuid' })
  serviceId!: string;

  @Column({ type: 'jsonb' })
  recurrence!: RecurrenceRule;

  @Column({ name: 'starts_on', type: 'date' })
  startsOn!: string;

  @Column({ name: 'ends_on', type: 'date', nullable: true })
  endsOn!: string | null;

  @Column({ type: 'varchar', length: 20 })
  status!: RecurringBookingScheduleStatus;

  @Column({ name: 'assignment_policy', type: 'varchar', length: 30 })
  assignmentPolicy!: RecurringBookingScheduleAssignmentPolicy;

  @Column({ name: 'approval_hold_expires_at', type: 'timestamptz', nullable: true })
  approvalHoldExpiresAt!: Date | null;

  @Column({ name: 'approved_by_staff_id', type: 'uuid', nullable: true })
  approvedByStaffId!: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;

  @Column({ name: 'cancellation_reason', type: 'varchar', length: 30, nullable: true })
  cancellationReason!: RecurringBookingScheduleCancellationReason | null;

  @Column({ name: 'created_by_staff_id', type: 'uuid', nullable: true })
  createdByStaffId!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', update: false })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
