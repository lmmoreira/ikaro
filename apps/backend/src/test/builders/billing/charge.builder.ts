import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { addDaysUTC, todayUTC } from '../../../shared/utils/calendar-date';
import { CalendarDate } from '../../../shared/value-objects/calendar-date.vo';
import type { BillingProvider } from '../../../contexts/billing/domain/billing-account.aggregate';
import {
  Charge,
  type ChargeKind,
  type ChargeProviderCreationStatus,
  type ChargeStatus,
} from '../../../contexts/billing/domain/charge.aggregate';
import type { ChargeLine } from '../../../contexts/billing/domain/charge-line';
import type { PaymentMethod } from '../../../contexts/billing/domain/provider-events';
import { MinorAmount } from '../../../contexts/billing/domain/value-objects/minor-amount.vo';
import { ChargeLineBuilder } from './charge-line.builder';

/**
 * A charge rebuilt from stored state (`reconstitute`), `PENDING` and not yet created at the
 * provider by default. Dates are relative to now, never a calendar date. Use `Charge.create` (or
 * the aggregate's methods on the built charge) when a spec is about the transition itself.
 */
export class ChargeBuilder {
  private id = uuidv7();
  private tenantId = uuidv7();
  private subscriptionId = uuidv7();
  private merchantProfileKey = 'BRL_FAKE';
  private kind: ChargeKind = 'PERIOD';
  private periodStart: string | null = addDaysUTC(todayUTC(), 10);
  private periodEnd: string | null = addDaysUTC(todayUTC(), 40);
  private dueDate = addDaysUTC(todayUTC(), 10);
  private lines: ChargeLine[] = [new ChargeLineBuilder().build()];
  private currency = 'BRL';
  private status: ChargeStatus = 'PENDING';
  private method: PaymentMethod | null = null;
  private paidAt: Date | null = null;
  private provider: BillingProvider | null = null;
  private providerChargeId: string | null = null;
  private paymentUrl: string | null = null;
  private paymentUrlExpiresAt: Date | null = null;
  private receiptUrl: string | null = null;
  private paymentReturnSeenAt: Date | null = null;
  private refundedMinor = 0;
  private providerCreationStatus: ChargeProviderCreationStatus = 'PENDING';
  private providerCreationAttempts = 0;
  private providerCreationLastAttemptAt: Date | null = null;
  private providerCancelPending = false;
  private version: number | undefined = 0;

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

  withMerchantProfileKey(merchantProfileKey: string): this {
    this.merchantProfileKey = merchantProfileKey;
    return this;
  }

  /** A recovery charge has no period dates (the period lives on the subscription). */
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

  withLines(lines: ChargeLine[]): this {
    this.lines = lines;
    return this;
  }

  withCurrency(currency: string): this {
    this.currency = currency;
    return this;
  }

  withStatus(status: ChargeStatus): this {
    this.status = status;
    return this;
  }

  withPaid(method: PaymentMethod, paidAt: Date, receiptUrl: string | null = null): this {
    this.status = 'PAID';
    this.method = method;
    this.paidAt = paidAt;
    this.receiptUrl = receiptUrl;
    return this;
  }

  withRefundedMinor(refundedMinor: number): this {
    this.refundedMinor = refundedMinor;
    return this;
  }

  withPaymentReturnSeenAt(paymentReturnSeenAt: Date | null): this {
    this.paymentReturnSeenAt = paymentReturnSeenAt;
    return this;
  }

  /** The provider created it: READY, with the provider id and link a `READY` charge must have. */
  withProviderReady(
    provider: BillingProvider,
    providerChargeId: string,
    paymentUrl = `https://pay.example/${providerChargeId}`,
  ): this {
    this.provider = provider;
    this.providerChargeId = providerChargeId;
    this.paymentUrl = paymentUrl;
    this.providerCreationStatus = 'READY';
    return this;
  }

  withPaymentUrlExpiresAt(paymentUrlExpiresAt: Date | null): this {
    this.paymentUrlExpiresAt = paymentUrlExpiresAt;
    return this;
  }

  withProviderCreationAttempts(providerCreationAttempts: number): this {
    this.providerCreationAttempts = providerCreationAttempts;
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

  /** `undefined` = never persisted, so the repository inserts instead of updating. */
  withVersion(version: number | undefined): this {
    this.version = version;
    return this;
  }

  build(): Charge {
    this.assertCreatable();
    const subtotal = MinorAmount.create(
      this.lines.reduce((sum, line) => sum + line.unitPriceMinor, 0),
      this.currency,
    );
    return Charge.reconstitute({
      id: this.id,
      tenantId: this.tenantId,
      subscriptionId: this.subscriptionId,
      merchantProfileKey: this.merchantProfileKey,
      kind: this.kind,
      periodStart: this.periodStart === null ? null : CalendarDate.create(this.periodStart),
      periodEnd: this.periodEnd === null ? null : CalendarDate.create(this.periodEnd),
      dueDate: CalendarDate.create(this.dueDate),
      lines: this.lines,
      subtotal,
      amount: subtotal,
      status: this.status,
      method: this.method,
      paidAt: this.paidAt,
      provider: this.provider,
      providerChargeId: this.providerChargeId,
      paymentUrl: this.paymentUrl,
      paymentUrlExpiresAt: this.paymentUrlExpiresAt,
      receiptUrl: this.receiptUrl,
      paymentReturnSeenAt: this.paymentReturnSeenAt,
      refunded: MinorAmount.create(this.refundedMinor, this.currency),
      providerCreationStatus: this.providerCreationStatus,
      providerCreationAttempts: this.providerCreationAttempts,
      providerCreationLastAttemptAt: this.providerCreationLastAttemptAt,
      providerCancelPending: this.providerCancelPending,
      ...(this.version === undefined ? {} : { version: this.version }),
    });
  }

  // The builder never makes a shape `Charge.create` refuses: at least one line, every line priced
  // in the charge currency (the period-date rules are the two `as…`/`withPeriod` methods').
  private assertCreatable(): void {
    if (this.lines.length === 0) throw new Error('ChargeBuilder: a charge needs at least one line');
    if (this.lines.some((line) => line.unitPrice.currency !== this.currency)) {
      throw new Error(`ChargeBuilder: every line must be priced in ${this.currency}`);
    }
  }
}
