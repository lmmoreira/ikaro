import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import type { CalendarDate } from '../../../shared/value-objects/calendar-date.vo';
import type { BillingProvider } from './billing-account.aggregate';
import type { ChargeLine } from './charge-line';
import type {
  ChargeIssuedNotice,
  ChargeKind,
  ChargeProps,
  ChargeProviderCreationStatus,
  ChargeStatus,
  NewChargeInput,
} from './charge.types';
import { assertChargeShape } from './charge-shape';
import { ChargeInvariantError } from './errors/billing-domain.error';
import { IllegalChargeTransitionError } from './errors/illegal-charge-transition.error';
import { ChargeIssued } from './events/charge-issued.event';
import { ChargePaid } from './events/charge-paid.event';
import type { PaymentMethod } from './provider-events';
import { MinorAmount } from './value-objects/minor-amount.vo';

export * from './charge.types';

/**
 * One bill, in its own aggregate (not a child of the subscription: one per period forever). The
 * lines and amounts are written once with the charge; afterwards only the status and the payment /
 * provider fields move, through the transition table in docs/DOMAIN_MODEL.md § Aggregate: Charge.
 *
 * Like `Subscription`, it never reads a clock: a method that needs an instant takes it. It raises no
 * domain event but one: `markPaid` raises `ChargePaid`, which the charge repository drains into the
 * outbox in the transaction of the save (the same shape as `Subscription`).
 * The creation lease (`provider_creation_attempts` / `_last_attempt_at`) belongs to the repository's
 * claim, so the aggregate only carries those two values and never changes them.
 */
export class Charge extends AggregateRoot {
  readonly id: string;
  readonly tenantId: string;
  readonly subscriptionId: string;
  readonly merchantProfileKey: string;
  readonly kind: ChargeKind;
  readonly periodStart: CalendarDate | null;
  readonly periodEnd: CalendarDate | null;
  readonly dueDate: CalendarDate;
  readonly subtotal: MinorAmount;
  readonly amount: MinorAmount;
  readonly providerCreationAttempts: number;
  readonly providerCreationLastAttemptAt: Date | null;

  private readonly _lines: readonly ChargeLine[];
  private _status: ChargeStatus;
  private _method: PaymentMethod | null;
  private _paidAt: Date | null;
  private _provider: BillingProvider | null;
  private _providerChargeId: string | null;
  private _paymentUrl: string | null;
  private _paymentUrlExpiresAt: Date | null;
  private _receiptUrl: string | null;
  private _paymentReturnSeenAt: Date | null;
  private _refunded: MinorAmount;
  private _providerCreationStatus: ChargeProviderCreationStatus;
  private _providerCancelPending: boolean;
  private _version: number | undefined;

  private constructor(props: ChargeProps) {
    super();
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.subscriptionId = props.subscriptionId;
    this.merchantProfileKey = props.merchantProfileKey;
    this.kind = props.kind;
    this.periodStart = props.periodStart;
    this.periodEnd = props.periodEnd;
    this.dueDate = props.dueDate;
    this._lines = Object.freeze([...props.lines]);
    this.subtotal = props.subtotal;
    this.amount = props.amount;
    this.providerCreationAttempts = props.providerCreationAttempts;
    this.providerCreationLastAttemptAt = props.providerCreationLastAttemptAt;
    this._status = props.status;
    this._method = props.method;
    this._paidAt = props.paidAt;
    this._provider = props.provider;
    this._providerChargeId = props.providerChargeId;
    this._paymentUrl = props.paymentUrl;
    this._paymentUrlExpiresAt = props.paymentUrlExpiresAt;
    this._receiptUrl = props.receiptUrl;
    this._paymentReturnSeenAt = props.paymentReturnSeenAt;
    this._refunded = props.refunded;
    this._providerCreationStatus = props.providerCreationStatus;
    this._providerCancelPending = props.providerCancelPending;
    this._version = props.version;
  }

  /**
   * A new `PENDING` charge whose provider creation is still to do. The subtotal is the sum of the
   * lines and the amount equals it (Brazil is tax-inclusive; the field exists so M28 can add tax).
   */
  static create(input: NewChargeInput): Charge {
    assertChargeShape(input);
    const subtotal = MinorAmount.create(
      input.lines.reduce((sum, line) => sum + line.unitPriceMinor, 0),
      input.currency,
    );
    return new Charge({
      id: uuidv7(),
      tenantId: input.tenantId,
      subscriptionId: input.subscriptionId,
      merchantProfileKey: input.merchantProfileKey,
      kind: input.kind,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      dueDate: input.dueDate,
      lines: input.lines,
      subtotal,
      amount: subtotal,
      status: 'PENDING',
      method: null,
      paidAt: null,
      provider: null,
      providerChargeId: null,
      paymentUrl: null,
      paymentUrlExpiresAt: null,
      receiptUrl: null,
      paymentReturnSeenAt: null,
      refunded: MinorAmount.create(0, input.currency),
      providerCreationStatus: 'PENDING',
      providerCreationAttempts: 0,
      providerCreationLastAttemptAt: null,
      providerCancelPending: false,
    });
  }

  static reconstitute(props: ChargeProps): Charge {
    return new Charge(props);
  }

  get lines(): readonly ChargeLine[] {
    return this._lines;
  }

  get status(): ChargeStatus {
    return this._status;
  }

  get method(): PaymentMethod | null {
    return this._method;
  }

  get paidAt(): Date | null {
    return this._paidAt;
  }

  get provider(): BillingProvider | null {
    return this._provider;
  }

  get providerChargeId(): string | null {
    return this._providerChargeId;
  }

  get paymentUrl(): string | null {
    return this._paymentUrl;
  }

  get paymentUrlExpiresAt(): Date | null {
    return this._paymentUrlExpiresAt;
  }

  get receiptUrl(): string | null {
    return this._receiptUrl;
  }

  get paymentReturnSeenAt(): Date | null {
    return this._paymentReturnSeenAt;
  }

  get refunded(): MinorAmount {
    return this._refunded;
  }

  get providerCreationStatus(): ChargeProviderCreationStatus {
    return this._providerCreationStatus;
  }

  get providerCancelPending(): boolean {
    return this._providerCancelPending;
  }

  get version(): number | undefined {
    return this._version;
  }

  /** Still payable: the two statuses the sweep and the open-charge scans look at. */
  get open(): boolean {
    return this._status === 'PENDING' || this._status === 'OVERDUE';
  }

  /**
   * What paying this charge means (UC-119). `PAID` is not an error: the page just refreshes to the
   * paid state (A4). `CANCELED`, `REFUNDED` and `CHARGEBACK` can no longer be paid (A5). `PENDING`
   * and `OVERDUE` are payable, and so is `FAILED` (unreachable in M26: a fresh link on it starts a
   * new provider attempt, so M29 needs no change here). Exhaustive on purpose: a new status will not
   * compile until it is placed.
   */
  get payability(): 'PAYABLE' | 'PAID' | 'NOT_PAYABLE' {
    switch (this._status) {
      case 'PAID':
        return 'PAID';
      case 'CANCELED':
      case 'REFUNDED':
      case 'CHARGEBACK':
        return 'NOT_PAYABLE';
      case 'PENDING':
      case 'OVERDUE':
      case 'FAILED':
        return 'PAYABLE';
    }
  }

  /**
   * The manager came back from the hosted page and the charge is still open: the one signal behind
   * "pagamento recebido, reativando…" (UC-119). The summary and `payment-return` both read it.
   */
  get paymentConfirmationPending(): boolean {
    return this.open && this._paymentReturnSeenAt !== null;
  }

  /** The repository calls it after a successful write so the next save checks the new version. */
  markPersisted(version: number): void {
    this._version = version;
  }

  /**
   * The provider's paid fact, **only ever called with a provider-verified one** (the re-read of
   * `ApplyChargeFactService`): legal from `PENDING`, `OVERDUE` and `CANCELED` (the provider could
   * not cancel it because it was already paid, UC-114 step 4), a no-op on `PAID` (the first signal
   * wins, a later one is ignored), illegal once refunded, charged back or failed. A paid charge
   * needs no provider cancel any more, so the retry flag is cleared. Raises `ChargePaid` once: a
   * repeat is a no-op with no second event. `recipientEmail` is the billing email the caller
   * resolved (`resolveBillingRecipientEmail`).
   */
  markPaid(
    method: PaymentMethod | null,
    paidAt: Date,
    receiptUrl: string | null,
    correlationId: string,
    recipientEmail: string | null,
  ): void {
    if (this._status === 'PAID') return;
    if (this._status !== 'PENDING' && this._status !== 'OVERDUE' && this._status !== 'CANCELED') {
      throw this.illegal('be paid');
    }
    this._status = 'PAID';
    this._method = method;
    this._paidAt = paidAt;
    this._receiptUrl = receiptUrl;
    this._providerCancelPending = false;
    this.addDomainEvent(
      ChargePaid.forCharge(this, correlationId, method, paidAt, receiptUrl, recipientEmail),
    );
  }

  /** `PENDING` → `OVERDUE` when the tenant-local due date has passed; a repeat is a no-op. */
  markOverdue(): void {
    if (this._status === 'OVERDUE') return;
    if (this._status !== 'PENDING') throw this.illegal('become overdue');
    this._status = 'OVERDUE';
  }

  /** `PENDING` / `OVERDUE` → `CANCELED` (plan re-issue, cancel, stale charge, exempt); a repeat is a no-op. */
  cancel(): void {
    if (this._status === 'CANCELED') return;
    if (!this.open) throw this.illegal('be cancelled');
    this._status = 'CANCELED';
  }

  /**
   * The provider's refunded total so far. Only a `PAID` charge is refunded: a partial refund only
   * raises `refunded`, the full amount also sets `REFUNDED`. The total is absolute, so a repeated
   * or older fact changes nothing, and more than the amount is illegal.
   */
  markRefunded(refundedTotal: MinorAmount): void {
    if (refundedTotal.currency !== this.amount.currency) {
      throw new ChargeInvariantError(`A refund must be in ${this.amount.currency}`);
    }
    if (this._status === 'REFUNDED') return;
    if (this._status !== 'PAID') throw this.illegal('be refunded');
    if (refundedTotal.amountMinor > this.amount.amountMinor) {
      throw this.illegal('be refunded above its amount');
    }
    if (refundedTotal.amountMinor <= this._refunded.amountMinor) return;
    this._refunded = refundedTotal;
    if (refundedTotal.amountMinor === this.amount.amountMinor) this._status = 'REFUNDED';
  }

  /** `PAID` → `CHARGEBACK` (a lost dispute); a repeat is a no-op. */
  markChargeback(): void {
    if (this._status === 'CHARGEBACK') return;
    if (this._status !== 'PAID') throw this.illegal('be charged back');
    this._status = 'CHARGEBACK';
  }

  /**
   * The provider created the charge: store its provider, id, link and expiry. Legal on a charge of
   * any status, a `PAID` or `CANCELED` one included (a webhook can land between the insert and this
   * write, and the provider did create it), and it never touches the status. With a `notice` it
   * raises `ChargeIssued` once, and only for a charge that can still be paid: a charge a webhook
   * already settled (or a local cancel closed) gets its provider fields but no invoice email.
   */
  markCreationReady(
    provider: BillingProvider,
    providerChargeId: string,
    paymentUrl: string,
    paymentUrlExpiresAt: Date | null,
    notice?: ChargeIssuedNotice,
  ): void {
    if (providerChargeId.trim() === '') {
      throw new ChargeInvariantError('A provider charge needs a non-empty id');
    }
    if (this._providerCreationStatus === 'READY') {
      if (this._providerChargeId === providerChargeId && this._provider === provider) return;
      throw this.illegal('be created at the provider twice');
    }
    this._provider = provider;
    this._providerChargeId = providerChargeId;
    this._paymentUrl = paymentUrl;
    this._paymentUrlExpiresAt = paymentUrlExpiresAt;
    this._providerCreationStatus = 'READY';
    if (notice && this.open) {
      this.addDomainEvent(
        ChargeIssued.forCharge(this, notice.correlationId, paymentUrl, notice.recipientEmail),
      );
    }
  }

  /**
   * A provider creation attempt failed. It records nothing on the charge: the charge stays
   * `PENDING` for the retry query, and the attempt was already counted by the repository's claim
   * (the only place that increments `provider_creation_attempts`, so one attempt is never counted
   * twice). `provider_creation_status = FAILED` is unreachable in M26. Illegal once `READY`.
   */
  markCreationFailed(): void {
    if (this._providerCreationStatus === 'READY') throw this.illegal('fail its provider creation');
  }

  /**
   * The provider issued a fresh link for a charge it already holds (UC-119 A1): replaces the stored
   * URL and expiry. Legal on a charge of any status (a webhook can settle it while the provider call
   * is in flight, and the link the provider issued is still stored), and it never touches the status
   * or raises an event. A charge the provider does not hold yet has nothing to renew.
   */
  renewPaymentLink(paymentUrl: string, paymentUrlExpiresAt: Date | null): void {
    if (paymentUrl.trim() === '') {
      throw new ChargeInvariantError('A payment link needs a non-empty URL');
    }
    if (this._providerCreationStatus !== 'READY') throw this.illegal('renew a link it never had');
    this._paymentUrl = paymentUrl;
    this._paymentUrlExpiresAt = paymentUrlExpiresAt;
  }

  /** The manager came back from the hosted payment page; the first return is the one kept. */
  recordPaymentReturn(now: Date): void {
    this._paymentReturnSeenAt ??= now;
  }

  /** Cancelled locally, the provider side still to do (reconcile retries every flagged charge). */
  markProviderCancelPending(): void {
    if (this._status !== 'CANCELED') throw this.illegal('be flagged for a provider cancel');
    this._providerCancelPending = true;
  }

  /** The provider confirmed the cancel. */
  clearProviderCancelPending(): void {
    if (!this._providerCancelPending) return;
    if (this._status !== 'CANCELED') throw this.illegal('clear its provider cancel flag');
    this._providerCancelPending = false;
  }

  private illegal(action: string): IllegalChargeTransitionError {
    return new IllegalChargeTransitionError(this._status, action);
  }
}
