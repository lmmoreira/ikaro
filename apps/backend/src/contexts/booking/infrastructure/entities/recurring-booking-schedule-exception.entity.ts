import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import {
  RecurringBookingScheduleActorType,
  RecurringBookingScheduleExceptionKind,
} from '../../domain/recurring-booking-schedule.aggregate';

// docs/13-DATABASE_SCHEMA.md § booking.recurring_booking_schedule_exceptions — one exception per
// skipped/rescheduled occurrence.
@Entity('recurring_booking_schedule_exceptions', { schema: 'booking' })
@Index(['tenantId', 'recurringScheduleId', 'occurrenceStart'], { unique: true })
export class RecurringBookingScheduleExceptionEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'recurring_schedule_id', type: 'uuid' })
  recurringScheduleId!: string;

  @Column({ name: 'occurrence_start', type: 'timestamptz' })
  occurrenceStart!: Date;

  @Column({ type: 'varchar', length: 20 })
  kind!: RecurringBookingScheduleExceptionKind;

  @Column({ name: 'replacement_booking_id', type: 'uuid', nullable: true })
  replacementBookingId!: string | null;

  @Column({ name: 'actor_type', type: 'varchar', length: 20 })
  actorType!: RecurringBookingScheduleActorType;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', update: false })
  createdAt!: Date;
}
