import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { ResourceType } from '../../domain/resource.types';
import { ResourceRequirementSelectionMode } from '../../domain/resource-requirement';

@Entity('service_resource_requirements', { schema: 'booking' })
@Index(['tenantId', 'serviceId', 'resourceType'], { unique: true })
export class ServiceResourceRequirementEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'service_id', type: 'uuid' })
  serviceId!: string;

  @Column({ name: 'resource_type', type: 'varchar', length: 20 })
  resourceType!: ResourceType;

  @Column({ name: 'selection_mode', type: 'varchar', length: 30 })
  selectionMode!: ResourceRequirementSelectionMode;

  @Column({ name: 'required_quantity', type: 'int', default: 1 })
  requiredQuantity!: number;
}

@Entity('service_resource_requirement_pool', { schema: 'booking' })
export class ServiceResourceRequirementPoolEntity {
  @PrimaryColumn({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @PrimaryColumn({ name: 'requirement_id', type: 'uuid' })
  requirementId!: string;

  @PrimaryColumn({ name: 'resource_id', type: 'uuid' })
  resourceId!: string;
}
