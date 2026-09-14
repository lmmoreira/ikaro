import { Entity, Index, PrimaryColumn } from 'typeorm';
import { ResourceType } from '../../domain/resource.types';

// Inert this milestone — schema exists from M22 Cluster 2, consumed by ClassScheduleTemplate
// once M24 ships. See ClassResourceSlot (domain VO).
@Entity('service_class_resource_pool', { schema: 'booking' })
@Index(['tenantId', 'serviceId', 'resourceType'])
export class ServiceClassResourcePoolEntity {
  @PrimaryColumn({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @PrimaryColumn({ name: 'service_id', type: 'uuid' })
  serviceId!: string;

  @PrimaryColumn({ name: 'resource_type', type: 'varchar', length: 20 })
  resourceType!: ResourceType;

  @PrimaryColumn({ name: 'resource_id', type: 'uuid' })
  resourceId!: string;
}
