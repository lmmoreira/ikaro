import { Column, Entity, PrimaryColumn } from 'typeorm';
import { HotsiteBranding, HotsiteModule } from '../../domain/hotsite-config.aggregate';

@Entity('hotsite_configs', { schema: 'platform' })
export class HotsiteConfigEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid', unique: true })
  tenantId!: string;

  @Column({ type: 'jsonb' })
  branding!: HotsiteBranding;

  @Column({ type: 'jsonb' })
  layout!: HotsiteModule[];

  @Column({ name: 'is_published', type: 'boolean', default: false })
  isPublished!: boolean;

  @Column({ name: 'created_at', type: 'timestamptz', insert: false, update: false })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
