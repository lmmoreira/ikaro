import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

// docs/13-DATABASE_SCHEMA.md § booking.booking_quote_revisions (M23 Cluster 3) — append-only,
// source-exclusive across the two booking families (appointment reschedule now; class attendee
// removal once M24 ships). classSessionBookingId stays unreachable (always null) until then.
@Entity('booking_quote_revisions', { schema: 'booking' })
@Index(['tenantId'])
@Index(['tenantId', 'bookingId', 'revisionNo'], { unique: true, where: 'booking_id IS NOT NULL' })
export class BookingQuoteRevisionEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'booking_id', type: 'uuid', nullable: true })
  bookingId!: string | null;

  @Column({ name: 'class_session_booking_id', type: 'uuid', nullable: true })
  classSessionBookingId!: string | null;

  @Column({ name: 'revision_no', type: 'int' })
  revisionNo!: number;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 3, default: 'BRL' })
  currency!: string;

  @Column({ type: 'varchar', length: 30 })
  reason!: string;

  @Column({ name: 'actor_type', type: 'varchar', length: 20 })
  actorType!: string;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId!: string | null;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;
}
