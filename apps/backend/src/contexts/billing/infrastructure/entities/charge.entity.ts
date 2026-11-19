import { Column, Entity, PrimaryColumn } from 'typeorm';

// One bill. Columns mirror docs/DATABASE_SCHEMA.md § `billing.charges`; the slice E / F2 / H columns
// (tax, origin, ADDON) are not mapped yet. The `BIGINT` money columns come back from the driver as
// strings: the mapper turns them into numbers (the amounts are safe integers, M25-D4).
// `version` is the optimistic lock and the two `provider_creation_*` columns belong to the creation
// claim: all three are written by the repository's own statements, never by an entity save.
@Entity('charges', { schema: 'billing' })
export class ChargeEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'subscription_id', type: 'uuid' })
  subscriptionId!: string;

  @Column({ type: 'varchar', length: 10, default: 'PERIOD' })
  kind!: string;

  // DATE columns: the driver returns the 'YYYY-MM-DD' string, which is what CalendarDate wraps.
  @Column({ name: 'period_start', type: 'date', nullable: true })
  periodStart!: string | null;

  @Column({ name: 'period_end', type: 'date', nullable: true })
  periodEnd!: string | null;

  @Column({ name: 'due_date', type: 'date' })
  dueDate!: string;

  @Column({ name: 'subtotal_minor', type: 'bigint' })
  subtotalMinor!: string;

  @Column({ name: 'amount_minor', type: 'bigint' })
  amountMinor!: string;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ name: 'merchant_profile_key', type: 'varchar', length: 40 })
  merchantProfileKey!: string;

  @Column({ type: 'varchar', length: 12 })
  status!: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  method!: string | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt!: Date | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  provider!: string | null;

  @Column({ name: 'provider_charge_id', type: 'varchar', length: 100, nullable: true })
  providerChargeId!: string | null;

  @Column({ name: 'payment_url', type: 'text', nullable: true })
  paymentUrl!: string | null;

  @Column({ name: 'payment_url_expires_at', type: 'timestamptz', nullable: true })
  paymentUrlExpiresAt!: Date | null;

  @Column({ name: 'receipt_url', type: 'text', nullable: true })
  receiptUrl!: string | null;

  @Column({ name: 'payment_return_seen_at', type: 'timestamptz', nullable: true })
  paymentReturnSeenAt!: Date | null;

  @Column({ name: 'refunded_amount_minor', type: 'bigint', default: '0' })
  refundedAmountMinor!: string;

  @Column({ name: 'provider_creation_status', type: 'varchar', length: 10, default: 'PENDING' })
  providerCreationStatus!: string;

  @Column({ name: 'provider_creation_attempts', type: 'int', default: 0 })
  providerCreationAttempts!: number;

  @Column({ name: 'provider_creation_last_attempt_at', type: 'timestamptz', nullable: true })
  providerCreationLastAttemptAt!: Date | null;

  @Column({ name: 'provider_cancel_pending', type: 'boolean', default: false })
  providerCancelPending!: boolean;

  @Column({ type: 'int', default: 0 })
  version!: number;

  @Column({ name: 'created_at', type: 'timestamptz', insert: false, update: false })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
