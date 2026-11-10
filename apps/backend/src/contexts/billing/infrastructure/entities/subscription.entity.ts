import { Column, Entity, PrimaryColumn } from 'typeorm';

// One row per tenant (`UQ_billing_subscriptions_tenant`). Columns mirror docs/DATABASE_SCHEMA.md
// § `billing.subscriptions`; the slice H columns (anchor_month, next_cycle) are not mapped yet.
// `version` is the optimistic lock, written by the repository's conditional UPDATE, not by TypeORM.
@Entity('subscriptions', { schema: 'billing' })
export class SubscriptionEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 12 })
  status!: string;

  @Column({ name: 'suspension_reason', type: 'varchar', length: 20, nullable: true })
  suspensionReason!: string | null;

  @Column({ name: 'country_code', type: 'char', length: 2 })
  countryCode!: string;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ type: 'varchar', length: 64 })
  timezone!: string;

  @Column({ name: 'merchant_profile_key', type: 'varchar', length: 40 })
  merchantProfileKey!: string;

  @Column({ type: 'varchar', length: 10, default: 'MONTHLY' })
  cycle!: string;

  @Column({ name: 'anchor_day', type: 'smallint' })
  anchorDay!: number;

  @Column({ name: 'trial_ends_at', type: 'timestamptz', nullable: true })
  trialEndsAt!: Date | null;

  @Column({ name: 'current_period_start', type: 'timestamptz', nullable: true })
  currentPeriodStart!: Date | null;

  @Column({ name: 'current_period_end', type: 'timestamptz', nullable: true })
  currentPeriodEnd!: Date | null;

  // DATE column: the driver returns the 'YYYY-MM-DD' string, which is what CalendarDate wraps.
  @Column({ name: 'next_due_date', type: 'date', nullable: true })
  nextDueDate!: string | null;

  @Column({ name: 'past_due_since', type: 'timestamptz', nullable: true })
  pastDueSince!: Date | null;

  @Column({ name: 'grace_until', type: 'timestamptz', nullable: true })
  graceUntil!: Date | null;

  @Column({ name: 'cancel_at', type: 'timestamptz', nullable: true })
  cancelAt!: Date | null;

  @Column({ name: 'plan_confirmed_at', type: 'timestamptz', nullable: true })
  planConfirmedAt!: Date | null;

  @Column({ name: 'suspended_at', type: 'timestamptz', nullable: true })
  suspendedAt!: Date | null;

  @Column({ name: 'purge_warning_30_sent_at', type: 'timestamptz', nullable: true })
  purgeWarning30SentAt!: Date | null;

  @Column({ name: 'purge_warning_7_sent_at', type: 'timestamptz', nullable: true })
  purgeWarning7SentAt!: Date | null;

  @Column({ name: 'has_ever_paid', type: 'boolean', default: false })
  hasEverPaid!: boolean;

  @Column({ type: 'boolean', default: false })
  exempt!: boolean;

  @Column({ type: 'int', default: 0 })
  version!: number;

  @Column({ name: 'created_at', type: 'timestamptz', insert: false, update: false })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
