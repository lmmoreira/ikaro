import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { ResourceType } from '../../domain/resource.types';
import { ResourceRequirementSelectionMode } from '../../domain/resource-requirement';

@Entity('service_legs', { schema: 'booking' })
@Index(['tenantId', 'serviceId', 'legIndex'], { unique: true })
export class ServiceLegEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'service_id', type: 'uuid' })
  serviceId!: string;

  @Column({ name: 'leg_index', type: 'int' })
  legIndex!: number;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'duration_minutes', type: 'int' })
  durationMinutes!: number;

  @Column({ name: 'transition_gap_after_minutes', type: 'int', default: 0 })
  transitionGapAfterMinutes!: number;
}

@Entity('service_leg_resource_requirements', { schema: 'booking' })
@Index(['tenantId', 'legId', 'resourceType'], { unique: true })
export class ServiceLegResourceRequirementEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'leg_id', type: 'uuid' })
  legId!: string;

  @Column({ name: 'resource_type', type: 'varchar', length: 20 })
  resourceType!: ResourceType;

  @Column({ name: 'selection_mode', type: 'varchar', length: 30 })
  selectionMode!: ResourceRequirementSelectionMode;

  @Column({ name: 'required_quantity', type: 'int', default: 1 })
  requiredQuantity!: number;
}

@Entity('service_leg_resource_requirement_pool', { schema: 'booking' })
export class ServiceLegResourceRequirementPoolEntity {
  @PrimaryColumn({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @PrimaryColumn({ name: 'requirement_id', type: 'uuid' })
  requirementId!: string;

  @PrimaryColumn({ name: 'resource_id', type: 'uuid' })
  resourceId!: string;
}
