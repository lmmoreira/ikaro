import { DateTime } from 'luxon';
import { FEATURE_KEYS } from '@ikaro/validation';
import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { CalendarDate } from '../../../shared/value-objects/calendar-date.vo';
import { CountryCode } from '../../../shared/value-objects/country-code.vo';
import { Timezone } from '../../../shared/value-objects/timezone.vo';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import {
  ExemptProtectedError,
  GraceNotAllowedError,
  SubscriptionInvariantError,
  UnsuspendNotAllowedError,
} from './errors/billing-domain.error';
import { defaultSelection, type SelectionEntry, validateSelection } from './plan-selection';
import { SubscriptionItem } from './subscription-item';
import { assertCurrencyMatchesCountry, trialWindow } from './subscription-trial-window';
import {
  GRACE_DAYS,
  PURGE_DAYS_NEVER_PAID,
  PURGE_DAYS_PAID,
  type SelectionChange,
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
 * The payment-driven transitions (M26) are not here: each is added by the first M26 story that needs it.
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
  private readonly _hasEverPaid: boolean;
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
    const selection = defaultSelection(input.features);
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
   * feature, or the given subset), and every trial / period / due field left NULL — it is never
   * charged. `anchorDay` follows the same rule as a trial so a later `clearExempt` is consistent.
   */
  static startExempt(input: StartSubscriptionInput): Subscription {
    const timezone = Timezone.create(input.timezone);
    assertCurrencyMatchesCountry(input.countryCode, input.currency);
    const selection = defaultSelection(input.features);
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
    if (this._suspendedAt === null) return null;
    const days = this._hasEverPaid ? PURGE_DAYS_PAID : PURGE_DAYS_NEVER_PAID;
    return DateTime.fromJSDate(this._suspendedAt, { zone: 'utc' }).plus({ days }).toJSDate();
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
   * An exempt subscription is never suspended. Already `OPERATOR`-suspended is a no-op; a
   * payment-based suspension becomes `OPERATOR` and keeps its clean-up clock (`suspendedAt`).
   */
  suspendByOperator(now: Date): void {
    if (this._exempt) {
      throw new ExemptProtectedError(
        'An exempt subscription is never suspended: clear exempt first',
      );
    }
    if (this._status === 'SUSPENDED') {
      this._suspensionReason = 'OPERATOR';
      return;
    }
    this._status = 'SUSPENDED';
    this._suspensionReason = 'OPERATOR';
    this._suspendedAt = now;
  }

  /**
   * Lifts an `OPERATOR` suspension — and only that one. Access returns as `TRIALING` when the
   * trial window is still running (the trial was never consumed), otherwise as `ACTIVE`. The
   * clean-up clock and its warning marks are cleared.
   */
  unsuspendOperator(now: Date): void {
    if (this._status !== 'SUSPENDED' || this._suspensionReason !== 'OPERATOR') {
      throw new UnsuspendNotAllowedError(
        'Only an OPERATOR suspension can be lifted by the operator; a payment-based one needs a payment',
      );
    }
    const trialRunning = this._trialEndsAt !== null && this._trialEndsAt.getTime() > now.getTime();
    this._status = trialRunning ? 'TRIALING' : 'ACTIVE';
    this.clearSuspension();
  }

  /**
   * Operator override of the 14-day grace: only while `PAST_DUE`, and never earlier than
   * `pastDueSince` + 14 days — a grace extends the window, it never shortens it.
   */
  extendGrace(graceUntil: Date): void {
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
    this._graceUntil = graceUntil;
  }

  /**
   * Free access: `ACTIVE`, never charged, suspended, purged or emailed about billing. Reactivates a
   * suspended subscription without payment (UC-137 A3), clears every trial / period / due field
   * (an exempt subscription has none), ends the plan as it stands — not-yet-started items are
   * removed, running ones end at `now` — and opens every feature from `now`. Already exempt: no-op.
   */
  setExempt(now: Date, actor: string): void {
    if (this._exempt) return;
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
  }

  /**
   * Back to paid: a fresh 14-day first-selection window (`TRIALING`) starting at `now`, the old
   * open-ended items ended and the default paid items `[trialEndsAt, ∞)` in their place.
   * `hasEverPaid` is never touched. The platform-owner tenant is never un-exempted
   * (`isPlatformOwner` is resolved by the caller from `PLATFORM_OWNER_TENANT_SLUG`). Not exempt: no-op.
   */
  clearExempt(now: Date, actor: string, isPlatformOwner: boolean): void {
    if (!this._exempt) return;
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
  }

  /** Called by the repository after a successful insert/update with the version now stored. */
  markPersisted(version: number): void {
    this._version = version;
    this._itemsDirty = false;
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
