import { Column, Entity, Index, PrimaryColumn, VersionColumn } from 'typeorm';
import { WeekDayName } from '../../../../shared/utils/calendar-date';
import {
  AvailabilityAlertCriteriaType,
  AvailabilityAlertStatus,
} from '../../domain/availability-alert.types';

// docs/13-DATABASE_SCHEMA.md § booking.availability_alerts (M23 Cluster 3).
@Entity('availability_alerts', { schema: 'booking' })
@Index(['tenantId', 'serviceId', 'status'])
@Index(['tenantId', 'customerId', 'status'])
@Index(['tenantId', 'status', 'expiresAt'])
export class AvailabilityAlertEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'service_id', type: 'uuid' })
  serviceId!: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ name: 'preferred_resource_id', type: 'uuid', nullable: true })
  preferredResourceId!: string | null;

  @Column({ name: 'criteria_type', type: 'varchar', length: 20 })
  criteriaType!: AvailabilityAlertCriteriaType;

  @Column({ type: 'varchar', length: 50 })
  timezone!: string;

  @Column({ name: 'acceptable_start_at', type: 'timestamptz', nullable: true })
  acceptableStartAt!: Date | null;

  @Column({ name: 'acceptable_end_at', type: 'timestamptz', nullable: true })
  acceptableEndAt!: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  weekdays!: WeekDayName[] | null;

  @Column({ name: 'local_start_time', type: 'time', nullable: true })
  localStartTime!: string | null;

  @Column({ name: 'local_end_time', type: 'time', nullable: true })
  localEndTime!: string | null;

  @Column({ name: 'duration_minutes', type: 'int', nullable: true })
  durationMinutes!: number | null;

  @Column({ name: 'participant_count', type: 'int', nullable: true })
  participantCount!: number | null;

  @Column({ type: 'varchar', length: 20 })
  status!: AvailabilityAlertStatus;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'created_at', type: 'timestamptz', update: false })
  createdAt!: Date;

  @VersionColumn({ name: 'version', default: 1 })
  version!: number;
}
