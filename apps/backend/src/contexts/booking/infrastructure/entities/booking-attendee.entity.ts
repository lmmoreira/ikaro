import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

// docs/13-DATABASE_SCHEMA.md § booking.service_booking_intake_schema / booking.booking_attendees
// (M22-S02) — optional child of a booking, populated only when the effective intake schema's
// requiresNamedAttendees is true. Schema-only in this story (reachable once a booking actually
// submits attendees in M23) — same "table exists now, consumed later" precedent as
// service_class_resource_pool (M22-S01).
@Entity('booking_attendees', { schema: 'booking' })
@Index(['tenantId', 'bookingId'])
export class BookingAttendeeEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'booking_id', type: 'uuid' })
  bookingId!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId!: string | null;

  @Column({ name: 'is_minor', type: 'boolean', default: false })
  isMinor!: boolean;
}
