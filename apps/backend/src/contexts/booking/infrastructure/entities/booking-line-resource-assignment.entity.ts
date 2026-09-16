import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { ResourceType } from '../../domain/resource.types';

// Immutable business/audit record for a booking line's resolved resource(s) — see
// docs/13-DATABASE_SCHEMA.md § booking.booking_line_resource_assignments. Distinct from
// resource_occupancy, which is the separate, short-lived locking projection.
@Entity('booking_line_resource_assignments', { schema: 'booking' })
@Index(['tenantId'])
@Index(['tenantId', 'resourceId'])
export class BookingLineResourceAssignmentEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'booking_line_id', type: 'uuid' })
  bookingLineId!: string;

  @Column({ name: 'resource_id', type: 'uuid' })
  resourceId!: string;

  @Column({ name: 'resource_type', type: 'varchar', length: 20 })
  resourceType!: ResourceType;

  @Column({ name: 'leg_index', type: 'int', nullable: true })
  legIndex!: number | null;

  @Column({ name: 'quantity_position', type: 'int', nullable: true })
  quantityPosition!: number | null;

  @Column({ name: 'resource_name_at_assignment', type: 'varchar', length: 255 })
  resourceNameAtAssignment!: string;

  @Column({ name: 'assigned_at', type: 'timestamptz' })
  assignedAt!: Date;
}
