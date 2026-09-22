import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { ResourceType } from '../../domain/resource.types';
import { ResourceOccupancyLockState } from '../../domain/resource-occupancy-lock-state';

export type ResourceOccupancySourceType = 'BOOKING_LINE' | 'CLASS_SESSION';

// The shared exclusivity lock — one row per resource-assignment, one GIST exclusion constraint
// spanning both BOOKING_LINE (reachable from M22) and CLASS_SESSION (inert until M24) so a
// resource shared across families can never be double-booked at the DB level. Pure locking
// projection, not a business record — see docs/13-DATABASE_SCHEMA.md § booking.resource_occupancy
// and docs/02-DOMAIN_MODEL.md's UC-060 note for why this must be one shared table.
@Entity('resource_occupancy', { schema: 'booking' })
@Index(['tenantId', 'resourceId', 'startsAt'])
export class ResourceOccupancyEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'resource_id', type: 'uuid' })
  resourceId!: string;

  @Column({ name: 'resource_type', type: 'varchar', length: 20 })
  resourceType!: ResourceType;

  @Column({ name: 'source_type', type: 'varchar', length: 20 })
  sourceType!: ResourceOccupancySourceType;

  @Column({ name: 'booking_line_resource_assignment_id', type: 'uuid', nullable: true })
  bookingLineResourceAssignmentId!: string | null;

  @Column({ name: 'leg_index', type: 'int', nullable: true })
  legIndex!: number | null;

  // FK target table (class_sessions) doesn't exist until M24 — plain UUID column, no FK
  // constraint, exactly as docs/13-DATABASE_SCHEMA.md documents ("unreachable in Cluster 2/3").
  @Column({ name: 'class_session_id', type: 'uuid', nullable: true })
  classSessionId!: string | null;

  @Column({ name: 'resource_name_at_assignment', type: 'varchar', length: 255 })
  resourceNameAtAssignment!: string;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt!: Date;

  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt!: Date;

  @Column({ name: 'lock_state', type: 'varchar', length: 20 })
  lockState!: ResourceOccupancyLockState;

  @Column({ name: 'hold_expires_at', type: 'timestamptz', nullable: true })
  holdExpiresAt!: Date | null;

  @Column({ name: 'created_at', type: 'timestamptz', update: false })
  createdAt!: Date;
}
