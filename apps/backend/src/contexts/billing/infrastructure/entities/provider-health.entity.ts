import { Column, Entity, PrimaryColumn } from 'typeorm';

// One row per merchant profile key, with no tenant: the provider account is platform-wide (the
// documented tenant-first exemption, as `platform.chatbot_provider_balance`). `freeze_active` and
// `freeze_since` move together (the table's CHECK).
@Entity('provider_health', { schema: 'billing' })
export class ProviderHealthEntity {
  @PrimaryColumn({ name: 'merchant_profile_key', type: 'varchar', length: 40 })
  merchantProfileKey!: string;

  @Column({ name: 'last_reconcile_ok_at', type: 'timestamptz', nullable: true })
  lastReconcileOkAt!: Date | null;

  @Column({ name: 'last_full_reconcile_at', type: 'timestamptz', nullable: true })
  lastFullReconcileAt!: Date | null;

  @Column({ name: 'webhook_status', type: 'varchar', length: 16, default: 'UNKNOWN' })
  webhookStatus!: string;

  @Column({ name: 'freeze_active', type: 'boolean', default: false })
  freezeActive!: boolean;

  @Column({ name: 'freeze_since', type: 'timestamptz', nullable: true })
  freezeSince!: Date | null;

  @Column({ name: 'health_read_failures', type: 'smallint', default: 0 })
  healthReadFailures!: number;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
