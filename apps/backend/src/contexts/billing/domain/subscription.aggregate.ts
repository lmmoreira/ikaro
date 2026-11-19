import { DateTime } from 'luxon';
import { FEATURE_KEYS } from '@ikaro/validation';
import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { CalendarDate } from '../../../shared/value-objects/calendar-date.vo';
import { CountryCode } from '../../../shared/value-objects/country-code.vo';
import { Timezone } from '../../../shared/value-objects/timezone.vo';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import {
  localDateEndUTC,
  localDateStartUTC,
  utcDateToLocalDate,
} from '../../../shared/utils/calendar-date';
import {
  ExemptProtectedError,
  GraceNotAllowedError,
  SubscriptionInvariantError,
  UnsuspendNotAllowedError,
} from './errors/billing-domain.error';
import { SubscriptionReactivated } from './events/subscription-reactivated.event';
import { SubscriptionSuspended } from './events/subscription-suspended.event';
import { defaultSelection, type SelectionEntry, validateSelection } from './plan-selection';
import { SubscriptionItem } from './subscription-item';
import { recoveryPaymentWindow } from './subscription-payment-window';
import { assertCurrencyMatchesCountry, trialWindow } from './subscription-trial-window';
import {
  GRACE_DAYS,
  PURGE_DAYS_NEVER_PAID,
  PURGE_DAYS_PAID,
  type SelectionChange,
  type ReversedChargeFacts,
  type SelectionPreview,
  type StartSubscriptionInput,
  type SubscriptionCycle,
  type SubscriptionProps,
  type SubscriptionStatus,
  type SuspensionReason,
} from './subscription.types';

// The types and constants live in subscription.types.ts and the trial-window maths in
// subscription-trial-window.ts; the types are re-exported so callers keep one import path.
export * from './subscription.types';

const SYSTEM_ACTOR = 'SYSTEM';

/**
 * The tenant's subscription (1 per tenant): status ladder, entitlement and plan. Entitlement is
 * computed, never stored. The aggregate never reads a clock or configuration: every state-changing
 * method takes `now`, and the platform-owner protection arrives as a flag the caller resolved.
 * The payment-driven transitions (M26) are added by the first M26 story that needs each one; the
 * provider-confirmed paid and reversed facts of the webhook (UC-114) are `markPeriodPaid`,
 * `reactivateOnPayment` and `reversePayment`.
 */
export class Subscription extends AggregateRoot {
  readonly id: string;
  readonly tenantId: string;
  readonly countryCode: CountryCode;
  readonly currency: string;
  readonly timezone: Timezone;
  readonly merchantProfileKey: string;
  readonly cycle: SubscriptionCycle;
  private _status: SubscriptionStatus;
  private _suspensionReason: SuspensionReason | null;
  private _anchorDay: number;
  private _trialEndsAt: Date | null;
  private _currentPeriodStart: Date | null;
  private _currentPeriodEnd: Date | null;
  private _nextDueDate: CalendarDate | null;
  private _pastDueSince: Date | null;
  private _graceUntil: Date | null;
  private _cancelAt: Date | null;
  private _planConfirmedAt: Date | null;
  private _suspendedAt: Date | null;
  private _purgeWarning30SentAt: Date | null;
  private _purgeWarning7SentAt: Date | null;
  private _hasEverPaid: boolean;
  private _exempt: boolean;
  private _items: SubscriptionItem[];
  private _version: number | undefined;
  // True after create/startX and after any method that touches the items; false after
  // reconstitute(): a status-only save (sweep, payment) then writes no item row at all.
  private _itemsDirty: boolean;

  private constructor(props: SubscriptionProps, itemsDirty: boolean) {
    super();
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.countryCode = props.countryCode;
    this.currency = props.currency;
    this.timezone = props.timezone;
    this.merchantProfileKey = props.merchantProfileKey;
    this.cycle = props.cycle;
    this._status = props.status;
    this._suspensionReason = props.suspensionReason;
    this._anchorDay = props.anchorDay;
    this._trialEndsAt = props.trialEndsAt;
    this._currentPeriodStart = props.currentPeriodStart;
    this._currentPeriodEnd = props.currentPeriodEnd;
    this._nextDueDate = props.nextDueDate;
    this._pastDueSince = props.pastDueSince;
    this._graceUntil = props.graceUntil;
    this._cancelAt = props.cancelAt;
    this._planConfirmedAt = props.planConfirmedAt;
    this._suspendedAt = props.suspendedAt;
    this._purgeWarning30SentAt = props.purgeWarning30SentAt;
    this._purgeWarning7SentAt = props.purgeWarning7SentAt;
    this._hasEverPaid = props.hasEverPaid;
    this._exempt = props.exempt;
    this._items = [...props.items];
    this._version = props.version;
    this._itemsDirty = itemsDirty;
  }

  /**
   * A new `TRIALING` subscription: the trial window, the renewal anchor, the due date of the first
   * invoice (the trial-end date) and the default paid items `[trialEndsAt, ∞)` — the plan the
   * manager can still change during the trial. Trial ACCESS is computed from the status, so the
   * items are never read for it.
   */
  static startTrial(input: StartSubscriptionInput): Subscription {
    const timezone = Timezone.create(input.timezone);
    assertCurrencyMatchesCountry(input.countryCode, input.currency);
    const selection = defaultSelection();
    validateSelection([], selection);
    const window = trialWindow(input.start, timezone);
    return new Subscription(
      {
        ...Subscription.baseProps(input, timezone, window.anchorDay),
        status: 'TRIALING',
        trialEndsAt: window.trialEndsAt,
        nextDueDate: window.nextDueDate,
        items: Subscription.itemsFor(selection, window.trialEndsAt, SYSTEM_ACTOR),
      },
      true,
    );
  }

  /**
   * A new free subscription: `ACTIVE`, `exempt`, open-ended items from the start instant (every
   * feature), and every trial / period / due field left NULL — it is never
   * charged. `anchorDay` follows the same rule as a trial so a later `clearExempt` is consistent.
   */
  static startExempt(input: StartSubscriptionInput): Subscription {
    const timezone = Timezone.create(input.timezone);
    assertCurrencyMatchesCountry(input.countryCode, input.currency);
    const selection = defaultSelection();
    validateSelection([], selection);
    const { anchorDay } = trialWindow(input.start, timezone);
    return new Subscription(
      {
        ...Subscription.baseProps(input, timezone, anchorDay),
        status: 'ACTIVE',
        exempt: true,
        trialEndsAt: null,
        nextDueDate: null,
        items: Subscription.itemsFor(selection, input.start, SYSTEM_ACTOR),
      },
      true,
    );
  }

  static reconstitute(props: SubscriptionProps): Subscription {
    return new Subscription(props, false);
  }

  private static baseProps(
    input: StartSubscriptionInput,
    timezone: Timezone,
    anchorDay: number,
  ): Omit<SubscriptionProps, 'status' | 'trialEndsAt' | 'nextDueDate' | 'items'> {
    return {
      id: uuidv7(),
      tenantId: input.tenantId,
      suspensionReason: null,
      countryCode: input.countryCode,
      currency: input.currency,
      timezone,
      merchantProfileKey: input.merchantProfileKey,
      cycle: 'MONTHLY',
      anchorDay,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      pastDueSince: null,
      graceUntil: null,
      cancelAt: null,
      planConfirmedAt: null,
      suspendedAt: null,
      purgeWarning30SentAt: null,
      purgeWarning7SentAt: null,
      hasEverPaid: false,
      exempt: false,
    };
  }

  private static itemsFor(
    selection: readonly SelectionEntry[],
    startsAt: Date,
    createdBy: string,
  ): SubscriptionItem[] {
    return selection.map((entry) =>
      SubscriptionItem.create({
        featureKey: entry.featureKey,
        tier: entry.tier,
        startsAt,
        endsAt: null,
        createdBy,
      }),
    );
  }

  get status(): SubscriptionStatus {
    return this._status;
  }
  get suspensionReason(): SuspensionReason | null {
    return this._suspensionReason;
  }
  get anchorDay(): number {
    return this._anchorDay;
  }
  get trialEndsAt(): Date | null {
    return this._trialEndsAt;
  }
  get currentPeriodStart(): Date | null {
    return this._currentPeriodStart;
  }
  get currentPeriodEnd(): Date | null {
    return this._currentPeriodEnd;
  }
  get nextDueDate(): CalendarDate | null {
    return this._nextDueDate;
  }
  get pastDueSince(): Date | null {
    return this._pastDueSince;
  }
  get graceUntil(): Date | null {
    return this._graceUntil;
  }
  get cancelAt(): Date | null {
    return this._cancelAt;
  }
  get planConfirmedAt(): Date | null {
    return this._planConfirmedAt;
  }
  get suspendedAt(): Date | null {
    return this._suspendedAt;
  }
  get purgeWarning30SentAt(): Date | null {
    return this._purgeWarning30SentAt;
  }
  get purgeWarning7SentAt(): Date | null {
    return this._purgeWarning7SentAt;
  }
  get hasEverPaid(): boolean {
    return this._hasEverPaid;
  }
  get exempt(): boolean {
    return this._exempt;
  }
  get items(): readonly SubscriptionItem[] {
    return [...this._items];
  }
  get version(): number | undefined {
    return this._version;
  }
  /** Whether `save()` must write the item rows (false for a status-only change). */
  get itemsDirty(): boolean {
    return this._itemsDirty;
  }

  /** Everything except SUSPENDED: a suspended tenant has nothing entitled and its hotsite is down. */
  get operational(): boolean {
    return this._status !== 'SUSPENDED';
  }

  /** `suspendedAt` + 90 days (never paid) or + 180 days (paid at least once); null while not suspended. */
  get purgeAt(): Date | null {
    return this._suspendedAt === null ? null : this.purgeAtFrom(this._suspendedAt);
  }

  /**
   * The single entitlement formula: SUSPENDED → none; TRIALING → every sellable feature (chatbot
   * at BASIC); otherwise the items active now. Computed on demand, never stored.
   */
  entitledAt(now: Date): SelectionEntry[] {
    if (this._status === 'SUSPENDED') return [];
    if (this._status === 'TRIALING') return defaultSelection();
    return this._items
      .filter((item) => item.isActiveAt(now))
      .map((item) => ({ featureKey: item.featureKey, tier: item.tier }));
  }

  /** The plan going forward: the items with no end date (a feature scheduled to leave is not in it). */
  get selection(): SelectionEntry[] {
    return this._items
      .filter((item) => item.endsAt === null)
      .map((item) => ({ featureKey: item.featureKey, tier: item.tier }));
  }

  /** Validates a proposed FINAL selection against this plan (pure). See `validateSelection`. */
  validateSelection(proposed: readonly SelectionEntry[]): void {
    validateSelection(this.selection, proposed);
  }

  /**
   * What saving `proposed` would change, with the date each change takes effect (the next paid
   * service-period start). Pure: nothing is saved and no price is read (M26-S17 adds totals).
   * Rejects exactly as `validateSelection` does.
   */
  previewSelection(proposed: readonly SelectionEntry[]): SelectionPreview {
    this.validateSelection(proposed);
    const effectiveFrom = this._status === 'TRIALING' ? this._trialEndsAt : this._currentPeriodEnd;
    const current = new Map(this.selection.map((entry) => [entry.featureKey, entry.tier]));
    const next = new Map(proposed.map((entry) => [entry.featureKey, entry.tier]));
    const changes: SelectionChange[] = [];
    for (const featureKey of FEATURE_KEYS) {
      const before = current.get(featureKey);
      const after = next.get(featureKey);
      if (before === after) continue;
      if (before === undefined && after !== undefined) {
        changes.push({ featureKey, tier: after, kind: 'ADD', effectiveFrom });
      } else if (before !== undefined && after === undefined) {
        changes.push({ featureKey, tier: before, kind: 'REMOVE', effectiveFrom });
      } else if (after !== undefined) {
        changes.push({ featureKey, tier: after, kind: 'TIER_CHANGE', effectiveFrom });
      }
    }
    return { changes };
  }

  /**
   * Operator suspension (abuse / takedown): payment does not lift it, only `unsuspendOperator`.
   * An exempt subscription is never suspended. A tenant that is already suspended, for any
   * reason, is left exactly as it is (no change, no event): converting a payment suspension into an
   * `OPERATOR` one would let the operator lift it with `unsuspendOperator` and restore access
   * without a payment, which UC-111 forbids. Returns whether the state changed.
   */
  suspendByOperator(now: Date, correlationId: string, recipientEmail: string | null): boolean {
    if (this._exempt) {
      throw new ExemptProtectedError(
        'An exempt subscription is never suspended: clear exempt first',
      );
    }
    if (this._status === 'SUSPENDED') return false;
    this._status = 'SUSPENDED';
    this._suspensionReason = 'OPERATOR';
    this._suspendedAt = now;
    this.addDomainEvent(
      new SubscriptionSuspended(this.tenantId, correlationId, {
        subscriptionId: this.id,
        reason: 'OPERATOR',
        suspendedAt: now.toISOString(),
        purgeAt: this.purgeAtFrom(now).toISOString(),
        recipientEmail,
      }),
    );
    return true;
  }

  /**
   * Lifts an `OPERATOR` suspension — and only that one. Access returns as `TRIALING` when the
   * trial window is still running (the trial was never consumed), otherwise as `ACTIVE`. The
   * clean-up clock and its warning marks are cleared. Raises `SubscriptionReactivated`. A
   * subscription that is not suspended is already in the requested state: no change, returns
   * `false`. A payment-based suspension is refused. Returns whether the state changed.
   */
  unsuspendOperator(now: Date, correlationId: string, recipientEmail: string | null): boolean {
    if (this._status !== 'SUSPENDED') return false;
    if (this._suspensionReason !== 'OPERATOR' || this._suspendedAt === null) {
      throw new UnsuspendNotAllowedError(
        'Only an OPERATOR suspension can be lifted by the operator; a payment-based one needs a payment',
      );
    }
    const suspendedAt = this._suspendedAt;
    const trialRunning = this._trialEndsAt !== null && this._trialEndsAt.getTime() > now.getTime();
    this._status = trialRunning ? 'TRIALING' : 'ACTIVE';
    this.clearSuspension();
    this.addReactivated(now, suspendedAt, correlationId, recipientEmail);
    return true;
  }

  /**
   * A `PERIOD` charge was paid (UC-114). Always records `hasEverPaid`. `TRIALING` stays as it is
   * (the status sweep writes the period at trial end); an exempt subscription and an `OPERATOR`
   * suspension are never changed by a payment. Otherwise the subscription is `ACTIVE`: the period
   * end moves to `max(current end, the charge's end)`, the start to the charge's start only when
   * that day is today or earlier (an invoice issued early does not change the current period),
   * `pastDueSince` / `graceUntil` clear, and a payment suspension ends (raising
   * `SubscriptionReactivated`). The period is the charge's own: `anchorDay` and `nextDueDate`
   * belong to the issue of the next charge and are never touched here. Returns whether the
   * subscription changed.
   */
  markPeriodPaid(
    periodStart: CalendarDate,
    periodEnd: CalendarDate,
    now: Date,
    correlationId: string,
    recipientEmail: string | null,
  ): boolean {
    const everPaid = this._hasEverPaid;
    this._hasEverPaid = true;
    const paidFlagChanged = !everPaid;
    if (this._exempt || this._status === 'TRIALING') return paidFlagChanged;
    if (this._status === 'SUSPENDED' && this._suspensionReason === 'OPERATOR') {
      return paidFlagChanged;
    }
    const suspendedAt = this._status === 'SUSPENDED' ? this._suspendedAt : null;
    const tz = this.timezone.value;
    const endsAt = localDateEndUTC(periodEnd.value, tz);
    if (this._currentPeriodEnd === null || endsAt.getTime() > this._currentPeriodEnd.getTime()) {
      this._currentPeriodEnd = endsAt;
    }
    if (periodStart.value <= utcDateToLocalDate(now, tz)) {
      this._currentPeriodStart = localDateStartUTC(periodStart.value, tz);
    }
    this._status = 'ACTIVE';
    this._pastDueSince = null;
    this._graceUntil = null;
    if (suspendedAt !== null) {
      this.clearSuspension();
      this._cancelAt = null;
      this.addReactivated(now, suspendedAt, correlationId, recipientEmail);
    }
    return true;
  }

  /**
   * A `RECOVERY` charge was paid (UC-114, UC-134): a payment suspension (`NON_PAYMENT`, `CANCELED`,
   * `PAYMENT_REVERSED`) ends. The subscription is `ACTIVE`, the suspension and its purge clock are
   * cleared, the new month starts at the payment moment and renews on the payment's tenant-local
   * day clamped to 28, and the next invoice falls due the day after the month ends. Raises
   * `SubscriptionReactivated`. Always records `hasEverPaid`; an exempt subscription, an `OPERATOR`
   * suspension and a subscription that is not suspended are left as they are (a payment never lifts
   * an operator suspension). Returns whether the subscription changed.
   */
  reactivateOnPayment(
    paidAt: Date,
    now: Date,
    correlationId: string,
    recipientEmail: string | null,
  ): boolean {
    const everPaid = this._hasEverPaid;
    this._hasEverPaid = true;
    const paidFlagChanged = !everPaid;
    if (this._exempt || this._status !== 'SUSPENDED' || this._suspendedAt === null) {
      return paidFlagChanged;
    }
    if (this._suspensionReason === 'OPERATOR') return paidFlagChanged;
    const suspendedAt = this._suspendedAt;
    const window = recoveryPaymentWindow(paidAt, this.timezone);
    this._status = 'ACTIVE';
    this.clearSuspension();
    this._cancelAt = null;
    this._pastDueSince = null;
    this._graceUntil = null;
    this._currentPeriodStart = paidAt;
    this._currentPeriodEnd = window.periodEnd;
    this._anchorDay = window.anchorDay;
    this._nextDueDate = window.nextDueDate;
    this.addReactivated(now, suspendedAt, correlationId, recipientEmail);
    return true;
  }

  /**
   * A full refund or a lost chargeback of a charge that **settled the current period** suspends
   * with `PAYMENT_REVERSED` and raises `SubscriptionSuspended`. A `PERIOD` charge settles it when
   * its days cover today in the subscription's zone; a `RECOVERY` charge when its payment moment is
   * the current period's start. Any other charge (an older period, a future one) changes no access,
   * and neither does `TRIALING` (nothing settled is being reversed), `SUSPENDED` (already off), an
   * exempt subscription or an `OPERATOR` suspension. Returns whether the subscription changed.
   */
  reversePayment(
    settled: ReversedChargeFacts,
    now: Date,
    correlationId: string,
    recipientEmail: string | null,
  ): boolean {
    if (this._exempt || (this._status !== 'ACTIVE' && this._status !== 'PAST_DUE')) return false;
    if (!this.settlesCurrentPeriod(settled, now)) return false;
    this._status = 'SUSPENDED';
    this._suspensionReason = 'PAYMENT_REVERSED';
    this._suspendedAt = now;
    this.addDomainEvent(
      new SubscriptionSuspended(this.tenantId, correlationId, {
        subscriptionId: this.id,
        reason: 'PAYMENT_REVERSED',
        suspendedAt: now.toISOString(),
        purgeAt: this.purgeAtFrom(now).toISOString(),
        recipientEmail,
      }),
    );
    return true;
  }

  private settlesCurrentPeriod(settled: ReversedChargeFacts, now: Date): boolean {
    if (settled.kind === 'RECOVERY') {
      return (
        settled.paidAt !== null &&
        this._currentPeriodStart !== null &&
        settled.paidAt.getTime() === this._currentPeriodStart.getTime()
      );
    }
    if (settled.periodStart === null || settled.periodEnd === null) return false;
    const today = utcDateToLocalDate(now, this.timezone.value);
    return settled.periodStart.value <= today && today <= settled.periodEnd.value;
  }

  /**
   * Operator override of the 14-day grace: only while `PAST_DUE`, and never earlier than
   * `pastDueSince` + 14 days, and never earlier than a grace already stored — a grace extends the
   * window, it never shortens it. Returns whether the stored `graceUntil` changed (the same
   * instant again is a no-op).
   */
  extendGrace(graceUntil: Date): boolean {
    if (this._status !== 'PAST_DUE' || this._pastDueSince === null) {
      throw new GraceNotAllowedError('Grace can only be extended on a PAST_DUE subscription');
    }
    const earliest = DateTime.fromJSDate(this._pastDueSince, { zone: 'utc' })
      .plus({ days: GRACE_DAYS })
      .toJSDate();
    if (graceUntil.getTime() < earliest.getTime()) {
      throw new GraceNotAllowedError(
        `Grace cannot end before pastDueSince + ${GRACE_DAYS} days (${earliest.toISOString()})`,
      );
    }
    if (this._graceUntil !== null && graceUntil.getTime() < this._graceUntil.getTime()) {
      throw new GraceNotAllowedError(
        `Grace cannot end before the grace already set (${this._graceUntil.toISOString()})`,
      );
    }
    if (this._graceUntil?.getTime() === graceUntil.getTime()) return false;
    this._graceUntil = graceUntil;
    return true;
  }

  /**
   * Free access: `ACTIVE`, never charged, suspended, purged or emailed about billing. Reactivates a
   * suspended subscription without payment (UC-137 A3), clears every trial / period / due field
   * (an exempt subscription has none), ends the plan as it stands — not-yet-started items are
   * removed, running ones end at `now` — and opens every feature from `now`. Raises
   * `SubscriptionReactivated` when it ends a suspension. Already exempt: no-op. Returns whether
   * the state changed.
   */
  setExempt(now: Date, actor: string, correlationId: string): boolean {
    if (this._exempt) return false;
    const suspendedAt = this._status === 'SUSPENDED' ? this._suspendedAt : null;
    this._exempt = true;
    this._status = 'ACTIVE';
    this.clearSuspension();
    this._trialEndsAt = null;
    this._currentPeriodStart = null;
    this._currentPeriodEnd = null;
    this._nextDueDate = null;
    this._pastDueSince = null;
    this._graceUntil = null;
    this._cancelAt = null;
    this._planConfirmedAt = null;
    this.replacePlan(now, now, actor);
    // An exempt subscription is never emailed about billing: no recipient.
    if (suspendedAt !== null) this.addReactivated(now, suspendedAt, correlationId, null);
    return true;
  }

  /**
   * Back to paid: a fresh 14-day first-selection window (`TRIALING`) starting at `now`, the old
   * open-ended items ended and the default paid items `[trialEndsAt, ∞)` in their place.
   * `hasEverPaid` is never touched. The platform-owner tenant is never un-exempted
   * (`isPlatformOwner` is resolved by the caller from `PLATFORM_OWNER_TENANT_SLUG`). Not exempt: no-op.
   * Returns whether the state changed.
   */
  clearExempt(now: Date, actor: string, isPlatformOwner: boolean): boolean {
    if (!this._exempt) return false;
    if (isPlatformOwner) {
      throw new ExemptProtectedError("The platform owner's subscription is always exempt");
    }
    const window = trialWindow(now, this.timezone);
    this._exempt = false;
    this._status = 'TRIALING';
    this._trialEndsAt = window.trialEndsAt;
    this._nextDueDate = window.nextDueDate;
    this._anchorDay = window.anchorDay;
    this._currentPeriodStart = null;
    this._currentPeriodEnd = null;
    this._pastDueSince = null;
    this._graceUntil = null;
    this._cancelAt = null;
    this._planConfirmedAt = null;
    this.replacePlan(now, window.trialEndsAt, actor);
    return true;
  }

  /** Called by the repository after a successful insert/update with the version now stored. */
  markPersisted(version: number): void {
    this._version = version;
    this._itemsDirty = false;
  }

  private purgeAtFrom(suspendedAt: Date): Date {
    const days = this._hasEverPaid ? PURGE_DAYS_PAID : PURGE_DAYS_NEVER_PAID;
    return DateTime.fromJSDate(suspendedAt, { zone: 'utc' }).plus({ days }).toJSDate();
  }

  private addReactivated(
    now: Date,
    suspendedAt: Date,
    correlationId: string,
    recipientEmail: string | null,
  ): void {
    this.addDomainEvent(
      new SubscriptionReactivated(this.tenantId, correlationId, {
        subscriptionId: this.id,
        reactivatedAt: now.toISOString(),
        suspendedAt: suspendedAt.toISOString(),
        recipientEmail,
        exempt: this._exempt,
      }),
    );
  }

  private clearSuspension(): void {
    this._suspensionReason = null;
    this._suspendedAt = null;
    this._purgeWarning30SentAt = null;
    this._purgeWarning7SentAt = null;
  }

  /** Ends the plan as it stands at `now` and opens every feature from `from`, in one step. */
  private replacePlan(now: Date, from: Date, actor: string): void {
    const kept = this._items.flatMap((item) => {
      if (item.startsAt.getTime() >= now.getTime()) return []; // not started: removed
      if (item.endsAt === null || item.endsAt.getTime() > now.getTime()) {
        return [item.endedAt(now)]; // running: ends now
      }
      return [item]; // already over: history
    });
    const added = Subscription.itemsFor(defaultSelection(), from, actor);
    this._items = [...kept];
    this.appendItems(added);
  }

  /** The only way items are added: no two windows of one feature may overlap (the DB GIST is the backstop). */
  private appendItems(added: readonly SubscriptionItem[]): void {
    for (const item of added) {
      if (this._items.some((existing) => existing.overlaps(item))) {
        throw new SubscriptionInvariantError(
          `Item windows of feature ${item.featureKey} must not overlap`,
        );
      }
      this._items.push(item);
    }
    this._itemsDirty = true;
  }
}
