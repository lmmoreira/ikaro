import { uuidv7 } from '../../../shared/domain/uuid-v7';
import type { CalendarDate } from '../../../shared/value-objects/calendar-date.vo';
import type { BillingProvider } from './billing-account.aggregate';
import type { ChargeLine } from './charge-line';
import type {
  ChargeKind,
  ChargeProps,
  ChargeProviderCreationStatus,
  ChargeStatus,
  NewChargeInput,
} from './charge.types';
import { ChargeInvariantError } from './errors/billing-domain.error';
import { IllegalChargeTransitionError } from './errors/illegal-charge-transition.error';
import type { PaymentMethod } from './provider-events';
import { MinorAmount } from './value-objects/minor-amount.vo';

export * from './charge.types';

/**
 * One bill, in its own aggregate (not a child of the subscription: one per period forever). The
 * lines and amounts are written once with the charge; afterwards only the status and the payment /
 * provider fields move, through the transition table in docs/DOMAIN_MODEL.md § Aggregate: Charge.
 *
 * Like `Subscription`, it never reads a clock: a method that needs an instant takes it. It raises no
 * domain event yet: the Billing events arrive with M26-S03 and are raised by the use cases.
 * The creation lease (`provider_creation_attempts` / `_last_attempt_at`) belongs to the repository's
 * claim, so the aggregate only carries those two values and never changes them.
 */
export class Charge {
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
    Charge.assertShape(input);
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

  private static assertShape(input: NewChargeInput): void {
    if (input.lines.length === 0) {
      throw new ChargeInvariantError('A charge needs at least one line');
    }
    if (input.lines.some((line) => line.unitPrice.currency !== input.currency)) {
      throw new ChargeInvariantError(`Every line must be priced in ${input.currency}`);
    }
    const hasPeriod = input.periodStart !== null && input.periodEnd !== null;
    const hasNoPeriod = input.periodStart === null && input.periodEnd === null;
    if (input.kind === 'PERIOD' && !hasPeriod) {
      throw new ChargeInvariantError('A PERIOD charge needs both period dates');
    }
    if (input.kind === 'RECOVERY' && !hasNoPeriod) {
      throw new ChargeInvariantError('A RECOVERY charge has no period dates');
    }
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

  /** The repository calls it after a successful write so the next save checks the new version. */
  markPersisted(version: number): void {
    this._version = version;
  }

  /**
   * The provider's paid fact, **only ever called with a provider-verified one** (the re-read of
   * `ApplyChargeFactUseCase`): legal from `PENDING`, `OVERDUE` and `CANCELED` (the provider could
   * not cancel it because it was already paid, UC-114 step 4), a no-op on `PAID` (the first signal
   * wins, a later one is ignored), illegal once refunded, charged back or failed. A paid charge
   * needs no provider cancel any more, so the retry flag is cleared.
   */
  markPaid(method: PaymentMethod | null, paidAt: Date, receiptUrl: string | null): void {
    if (this._status === 'PAID') return;
    if (this._status !== 'PENDING' && this._status !== 'OVERDUE' && this._status !== 'CANCELED') {
      throw this.illegal('be paid');
    }
    this._status = 'PAID';
    this._method = method;
    this._paidAt = paidAt;
    this._receiptUrl = receiptUrl;
    this._providerCancelPending = false;
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
   * write, and the provider did create it), and it never touches the status.
   */
  markCreationReady(
    provider: BillingProvider,
    providerChargeId: string,
    paymentUrl: string,
    paymentUrlExpiresAt: Date | null,
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
