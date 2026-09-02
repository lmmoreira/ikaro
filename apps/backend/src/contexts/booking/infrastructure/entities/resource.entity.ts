import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { ResourceType, ResourceWorkingHours } from '../../domain/resource.types';

@Entity('resources', { schema: 'booking' })
@Index(['tenantId'])
@Index(['tenantId', 'type', 'isActive'])
export class ResourceEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 20 })
  type!: ResourceType;

  @Column({ name: 'ref_id', type: 'uuid', nullable: true })
  refId!: string | null;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'working_hours', type: 'jsonb', nullable: true })
  workingHours!: ResourceWorkingHours | null;

  @Column({ name: 'turnover_minutes', type: 'int', default: 0 })
  turnoverMinutes!: number;

  @Column({ name: 'max_capacity', type: 'int', nullable: true })
  maxCapacity!: number | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'created_at', type: 'timestamptz', update: false })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
