import { Column, Entity, PrimaryColumn } from 'typeorm';
import { ResourceType } from '../../domain/resource.types';

// docs/13-DATABASE_SCHEMA.md § booking.recurring_booking_schedule_resource_assignments — durable
// child assignment record, mandatory for FIXED_ASSIGNMENT (empty for RESOLVE_PER_OCCURRENCE).
@Entity('recurring_booking_schedule_resource_assignments', { schema: 'booking' })
export class RecurringBookingScheduleResourceAssignmentEntity {
  @PrimaryColumn({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @PrimaryColumn({ name: 'recurring_schedule_id', type: 'uuid' })
  recurringScheduleId!: string;

  @PrimaryColumn({ name: 'resource_id', type: 'uuid' })
  resourceId!: string;

  @Column({ name: 'requirement_id', type: 'uuid', nullable: true })
  requirementId!: string | null;

  @Column({ name: 'resource_type', type: 'varchar', length: 20 })
  resourceType!: ResourceType;

  @Column({ name: 'required_quantity_position', type: 'int', nullable: true })
  requiredQuantityPosition!: number | null;

  @Column({ name: 'assigned_at', type: 'timestamptz' })
  assignedAt!: Date;
}
