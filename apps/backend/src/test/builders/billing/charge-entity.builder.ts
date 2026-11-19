import { ChargeEntity } from '../../../contexts/billing/infrastructure/entities/charge.entity';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { addDaysUTC, todayUTC } from '../../../shared/utils/calendar-date';

export class ChargeEntityBuilder {
  private id = uuidv7();
  private tenantId = uuidv7();
  private subscriptionId = uuidv7();
  private kind = 'PERIOD';
  private periodStart: string | null = addDaysUTC(todayUTC(), 10);
  private periodEnd: string | null = addDaysUTC(todayUTC(), 40);
  private dueDate = addDaysUTC(todayUTC(), 10);
  private subtotalMinor = '4900';
  private amountMinor = '4900';
  private currency = 'BRL';
  private merchantProfileKey = 'BRL_FAKE';
  private status = 'PENDING';
  private readonly method: string | null = null;
  private paidAt: Date | null = null;
  private provider: string | null = null;
  private providerChargeId: string | null = null;
  private readonly paymentUrl: string | null = null;
  private readonly paymentUrlExpiresAt: Date | null = null;
  private readonly receiptUrl: string | null = null;
  private readonly paymentReturnSeenAt: Date | null = null;
  private refundedAmountMinor = '0';
  private providerCreationStatus = 'PENDING';
  private providerCreationAttempts = 0;
  private providerCreationLastAttemptAt: Date | null = null;
  private providerCancelPending = false;
  private version = 0;

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withSubscriptionId(subscriptionId: string): this {
    this.subscriptionId = subscriptionId;
    return this;
  }

  /** A recovery charge has no period dates (the table's CHECK requires NULLs for it). */
  asRecovery(): this {
    this.kind = 'RECOVERY';
    this.periodStart = null;
    this.periodEnd = null;
    return this;
  }

  withPeriod(periodStart: string, periodEnd: string): this {
    this.kind = 'PERIOD';
    this.periodStart = periodStart;
    this.periodEnd = periodEnd;
    return this;
  }

  withDueDate(dueDate: string): this {
    this.dueDate = dueDate;
    return this;
  }

  withAmountMinor(amountMinor: number): this {
    this.subtotalMinor = String(amountMinor);
    this.amountMinor = String(amountMinor);
    return this;
  }

  withStatus(status: string): this {
    this.status = status;
    return this;
  }

  withKind(kind: string): this {
    this.kind = kind;
    return this;
  }

  withSubtotalMinor(subtotalMinor: number): this {
    this.subtotalMinor = String(subtotalMinor);
    return this;
  }

  withCurrency(currency: string): this {
    this.currency = currency;
    return this;
  }

  withMerchantProfileKey(merchantProfileKey: string): this {
    this.merchantProfileKey = merchantProfileKey;
    return this;
  }

  withRefundedAmountMinor(refundedAmountMinor: number): this {
    this.refundedAmountMinor = String(refundedAmountMinor);
    return this;
  }

  withProviderCreationStatus(providerCreationStatus: string): this {
    this.providerCreationStatus = providerCreationStatus;
    return this;
  }

  withProviderCreationAttempts(providerCreationAttempts: number): this {
    this.providerCreationAttempts = providerCreationAttempts;
    return this;
  }

  withPaidAt(paidAt: Date | null): this {
    this.paidAt = paidAt;
    return this;
  }

  /** The CHECK `READY ⇒ provider_charge_id NOT NULL` needs the id set together. */
  withProviderReady(provider: string, providerChargeId: string): this {
    this.provider = provider;
    this.providerChargeId = providerChargeId;
    this.providerCreationStatus = 'READY';
    return this;
  }

  withCreationAttempts(attempts: number, lastAttemptAt: Date | null): this {
    this.providerCreationAttempts = attempts;
    this.providerCreationLastAttemptAt = lastAttemptAt;
    return this;
  }

  withProviderCancelPending(providerCancelPending = true): this {
    this.providerCancelPending = providerCancelPending;
    return this;
  }

  withVersion(version: number): this {
    this.version = version;
    return this;
  }

  build(): ChargeEntity {
    const e = new ChargeEntity();
    e.id = this.id;
    e.tenantId = this.tenantId;
    e.subscriptionId = this.subscriptionId;
    e.kind = this.kind;
    e.periodStart = this.periodStart;
    e.periodEnd = this.periodEnd;
    e.dueDate = this.dueDate;
    e.subtotalMinor = this.subtotalMinor;
    e.amountMinor = this.amountMinor;
    e.currency = this.currency;
    e.merchantProfileKey = this.merchantProfileKey;
    e.status = this.status;
    e.method = this.method;
    e.paidAt = this.paidAt;
    e.provider = this.provider;
    e.providerChargeId = this.providerChargeId;
    e.paymentUrl = this.paymentUrl;
    e.paymentUrlExpiresAt = this.paymentUrlExpiresAt;
    e.receiptUrl = this.receiptUrl;
    e.paymentReturnSeenAt = this.paymentReturnSeenAt;
    e.refundedAmountMinor = this.refundedAmountMinor;
    e.providerCreationStatus = this.providerCreationStatus;
    e.providerCreationAttempts = this.providerCreationAttempts;
    e.providerCreationLastAttemptAt = this.providerCreationLastAttemptAt;
    e.providerCancelPending = this.providerCancelPending;
    e.version = this.version;
    e.updatedAt = new Date();
    return e;
  }
}
