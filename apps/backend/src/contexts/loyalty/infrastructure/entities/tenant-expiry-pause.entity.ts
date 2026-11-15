import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('tenant_expiry_pauses', { schema: 'loyalty' })
@Index('IDX_loyalty_tenant_expiry_pauses_open', ['tenantId'], { where: '"resumed_at" IS NULL' })
export class TenantExpiryPauseEntity {
  @PrimaryColumn({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @PrimaryColumn({ name: 'paused_at', type: 'timestamptz' })
  pausedAt!: Date;

  @Column({ name: 'resumed_at', type: 'timestamptz', nullable: true })
  resumedAt!: Date | null;
}
