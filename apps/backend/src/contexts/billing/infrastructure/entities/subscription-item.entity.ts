import { Column, Entity, PrimaryColumn } from 'typeorm';

// One row per feature of the SELECTED plan, over the half-open window [starts_at, ends_at).
// `EX_billing_subscription_items_window` (GIST) rejects overlapping windows of one feature; the
// composite FK (tenant_id, subscription_id) blocks a cross-tenant parent.
@Entity('subscription_items', { schema: 'billing' })
export class SubscriptionItemEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'subscription_id', type: 'uuid' })
  subscriptionId!: string;

  @Column({ name: 'feature_key', type: 'varchar', length: 20 })
  featureKey!: string;

  @Column({ type: 'varchar', length: 20, default: 'STANDARD' })
  tier!: string;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt!: Date;

  @Column({ name: 'ends_at', type: 'timestamptz', nullable: true })
  endsAt!: Date | null;

  @Column({ name: 'created_by', type: 'varchar', length: 100 })
  createdBy!: string;

  @Column({ name: 'created_at', type: 'timestamptz', insert: false, update: false })
  createdAt!: Date;
}
