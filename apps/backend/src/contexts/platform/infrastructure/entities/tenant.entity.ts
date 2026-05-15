import { Column, Entity, PrimaryColumn } from 'typeorm';
import { TenantSettingsProps } from '../../domain/value-objects/tenant-settings.vo';

@Entity('tenants', { schema: 'platform' })
export class TenantEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  slug!: string;

  @Column({ type: 'jsonb' })
  settings!: TenantSettingsProps;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'created_at', type: 'timestamptz', update: false })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
