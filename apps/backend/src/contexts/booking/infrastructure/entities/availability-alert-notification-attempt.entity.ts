import { Column, Entity, PrimaryColumn } from 'typeorm';
import {
  AvailabilityAlertAttemptChannel,
  AvailabilityAlertAttemptOutcome,
} from '../../domain/availability-alert.types';

// docs/13-DATABASE_SCHEMA.md § booking.availability_alert_notification_attempts (M23 Cluster 3).
// Append-only history of "this alert was matched by this slot" — one row per (alert, window,
// channel), enforced by the table's UNIQUE constraint. The composite FK to availability_alerts is
// created by the migration (its UNIQUE (tenant_id, alert_id, matching_window, channel) also serves
// the per-alert lookup, so no separate index); the retention job deletes these rows with their alert.
@Entity('availability_alert_notification_attempts', { schema: 'booking' })
export class AvailabilityAlertNotificationAttemptEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'alert_id', type: 'uuid' })
  alertId!: string;

  // A Postgres `tstzrange` — TypeORM surfaces it as its text form, '[start,end)'. Written by the
  // repository as that literal, so the half-open [startsAt, endsAt) slot round-trips exactly.
  @Column({ name: 'matching_window', type: 'tstzrange' })
  matchingWindow!: string;

  @Column({ type: 'varchar', length: 20 })
  channel!: AvailabilityAlertAttemptChannel;

  @Column({ name: 'attempted_at', type: 'timestamptz', default: () => 'now()' })
  attemptedAt!: Date;

  @Column({ type: 'varchar', length: 20 })
  outcome!: AvailabilityAlertAttemptOutcome;
}
