import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

// docs/13-DATABASE_SCHEMA.md § booking.booking_status_transitions (M23 Cluster 3) — append-only
// audit of a booking's status changes. Tenant-first composite primary key (partition-ready) and a
// (tenant_id, booking_id, occurred_at) index, because every read is per booking.
@Entity('booking_status_transitions', { schema: 'booking' })
@Index(['tenantId', 'bookingId', 'occurredAt'])
export class BookingStatusTransitionEntity {
  @PrimaryColumn({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'booking_id', type: 'uuid' })
  bookingId!: string;

  @Column({ name: 'from_status', type: 'varchar', length: 30 })
  fromStatus!: string;

  @Column({ name: 'to_status', type: 'varchar', length: 30 })
  toStatus!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason!: string | null;

  @Column({ name: 'actor_type', type: 'varchar', length: 20 })
  actorType!: string;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId!: string | null;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ name: 'correlation_id', type: 'uuid' })
  correlationId!: string;
}
