import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

@Entity('booking_lines', { schema: 'booking' })
@Index(['tenantId'])
@Index(['tenantId', 'bookingId'])
@Index(['tenantId', 'serviceId'])
// M22-S03: lets booking_line_resource_assignments/resource_occupancy express a composite FK to
// this table (tenant-first, per CLAUDE.md §2.4) — added via migration 1748500000012, not TypeORM
// synchronize.
@Unique('UQ_booking_booking_lines_tenant_line', ['tenantId', 'lineId'])
export class BookingLineEntity {
  @PrimaryColumn({ name: 'line_id', type: 'uuid' })
  lineId!: string;

  @Column({ name: 'booking_id', type: 'uuid' })
  bookingId!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'service_id', type: 'uuid' })
  serviceId!: string;

  @Column({ name: 'service_name_at_booking', type: 'varchar', length: 255 })
  serviceNameAtBooking!: string;

  @Column({ name: 'price_at_booking_amount', type: 'numeric', precision: 10, scale: 2 })
  priceAtBookingAmount!: string;

  @Column({ name: 'duration_mins_at_booking', type: 'int' })
  durationMinsAtBooking!: number;

  @Column({ name: 'points_value_at_booking', type: 'int', default: 0 })
  pointsValueAtBooking!: number;

  @Column({ name: 'requires_pickup_address_at_booking', type: 'boolean', default: false })
  requiresPickupAddressAtBooking!: boolean;

  @Column({
    name: 'actual_price_charged_amount',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  actualPriceChargedAmount!: string | null;
}
