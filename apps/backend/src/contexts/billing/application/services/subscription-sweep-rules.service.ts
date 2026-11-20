import { Inject, Injectable } from '@nestjs/common';
import { todayInTimezone } from '../../../../shared/utils/calendar-date';
import { mapSequentially } from '../../../../shared/utils/sequential';
import type { Charge } from '../../domain/charge.aggregate';
import type { Subscription } from '../../domain/subscription.aggregate';
import { CHARGE_REPOSITORY, IChargeRepository } from '../ports/charge-repository.port';
import { type RecoveryPriceCache, RecoveryChargePlanner } from './recovery-charge-planner.service';

/** What one sweep run did to a subscription, for the run's counts. */
export type SweepStep =
  'OVERDUE' | 'PAST_DUE' | 'CANCELED' | 'TRIAL_ACTIVATED' | 'TRIAL_SUSPENDED' | 'GRACE_SUSPENDED';

export interface SweepContext {
  now: Date;
  correlationId: string;
  /** The billing email resolved before the transaction (`resolveBillingRecipientEmail`). */
  recipientEmail: string | null;
  /** The merchant profile's suspension freeze is on (UC-140): no `NON_PAYMENT` suspension, rules 2 and 3. */
  frozen: boolean;
  /**
   * The first charge the provider was asked about before the transaction and did not report paid.
   * An unpaid trial is never suspended on a snapshot alone: a charge the provider knows needs this
   * fresh answer first (a missed webhook must never lock out a paying tenant).
   */
  verifiedUnpaidChargeId: string | null;
  priceCache?: RecoveryPriceCache;
}

export interface SweepChanges {
  steps: SweepStep[];
  /** The locked charges a rule changed; the caller saves them inside its transaction. */
  charges: Charge[];
  /** The `RECOVERY` charge a non-payment suspension inserts `PENDING`, to create at the provider after commit. */
  recovery: Charge | null;
  subscriptionChanged: boolean;
  /** Charges cancelled locally that exist at the provider (flagged `provider_cancel_pending`): cancelled there after commit. */
  cancelAtProvider: string[];
  /** A non-payment suspension that was due but waited for a provider answer this run. */
  deferred: boolean;
}

/**
 * One run over one subscription: the charges it locked (a second ask for the same id returns the
 * same instance, so two rules never save two copies of one charge) and what it changed.
 */
class SweepRun {
  readonly changes: SweepChanges = {
    steps: [],
    charges: [],
    recovery: null,
    subscriptionChanged: false,
    cancelAtProvider: [],
    deferred: false,
  };
  private readonly locked = new Map<string, Charge>();

  constructor(
    readonly subscription: Subscription,
    readonly ctx: SweepContext,
    private readonly charges: IChargeRepository,
  ) {}

  /** B-C1 (`docs/LOCK_CATALOG.md`), after the subscription row the caller already holds. */
  async lock(chargeId: string): Promise<Charge | null> {
    const known = this.locked.get(chargeId);
    if (known) return known;
    const charge = await this.charges.findByIdForUpdate(this.subscription.tenantId, chargeId);
    if (charge) this.locked.set(chargeId, charge);
    return charge;
  }

  changed(charge: Charge): void {
    if (!this.changes.charges.includes(charge)) this.changes.charges.push(charge);
  }

  step(step: SweepStep): void {
    this.changes.steps.push(step);
  }

  subscriptionMoved(step: SweepStep): void {
    this.changes.subscriptionChanged = true;
    this.changes.steps.push(step);
  }
}

/**
 * The status sweep's rules for one subscription (UC-115), each a separate private step, applied in
 * the order that settles every overlap: overdue (1), cancel-at (4), trial end and trial to paid (2
 * and 5), past due (3). Cancel-at therefore wins over non-payment, so a tenant who cancelled is not
 * asked to pay a month to reactivate. It reads, locks and mutates aggregates and builds the recovery
 * charge; the caller owns the transaction and the saves, and every provider call is outside it.
 * A suspended subscription never changes reason: the predicates only fire for a status that still
 * has access.
 */
@Injectable()
export class SubscriptionSweepRules {
  constructor(
    @Inject(CHARGE_REPOSITORY) private readonly charges: IChargeRepository,
    private readonly planner: RecoveryChargePlanner,
  ) {}

  async apply(subscription: Subscription, ctx: SweepContext): Promise<SweepChanges> {
    const run = new SweepRun(subscription, ctx, this.charges);
    await this.markOverdue(run);
    if (this.cancelDue(run)) return run.changes;
    await this.settleTrial(run);
    await this.suspendPastDue(run);
    return run.changes;
  }

  // Rule 1: a `PENDING` charge the payer could pay (provider creation `READY`) whose tenant-local
  // due date has passed becomes `OVERDUE`; a `PERIOD` one also moves an `ACTIVE` subscription to
  // `PAST_DUE`. A charge with no payment link yet is neither: nobody could pay it.
  private async markOverdue(run: SweepRun): Promise<void> {
    const { subscription, ctx } = run;
    const today = todayInTimezone(subscription.timezone.value, ctx.now);
    const open = await this.charges.findOpenByTenant(subscription.tenantId);
    await mapSequentially(open, async (candidate) => {
      const isOverdue =
        candidate.status === 'PENDING' &&
        candidate.providerCreationStatus === 'READY' &&
        candidate.dueDate.value < today;
      if (!isOverdue) return;
      const charge = await run.lock(candidate.id);
      if (charge?.status !== 'PENDING') return;
      charge.markOverdue();
      run.changed(charge);
      run.step('OVERDUE');
      const pastDue =
        charge.kind === 'PERIOD' &&
        subscription.markPastDue(ctx.now, ctx.correlationId, ctx.recipientEmail);
      if (pastDue) run.subscriptionMoved('PAST_DUE');
    });
  }

  // Rule 4: `cancelAt` reached. Not a payment judgement, so the freeze never holds it back, and no
  // recovery charge is issued (the manager reactivates on purpose, UC-134).
  private cancelDue(run: SweepRun): boolean {
    const { subscription, ctx } = run;
    if (!subscription.isCancelDue(ctx.now)) return false;
    if (!subscription.suspendCanceled(ctx.now, ctx.correlationId, ctx.recipientEmail)) return false;
    run.subscriptionMoved('CANCELED');
    return true;
  }

  // Rules 5 and 2: the trial window is over. A paid first charge activates the subscription; an
  // unpaid one (or none) suspends it once the settlement margin has passed, directly, with no
  // `PAST_DUE`. A `REFUNDED` first charge counts as unpaid.
  private async settleTrial(run: SweepRun): Promise<void> {
    const { subscription, ctx } = run;
    if (!subscription.hasTrialEnded(ctx.now)) return;
    const found = await this.charges.findFirstPeriodCharge(subscription.tenantId, subscription.id);
    const first = found === null ? null : await run.lock(found.id);
    if (first?.status === 'PAID') {
      if (subscription.activateAfterTrial(ctx.now)) run.subscriptionMoved('TRIAL_ACTIVATED');
      return;
    }
    const paymentReturnSeen = first?.open === true && first.paymentReturnSeenAt !== null;
    if (ctx.frozen || !subscription.isTrialSettlementOver(ctx.now, paymentReturnSeen)) return;
    // A charge the provider knows needs the provider's fresh answer before the tenant is suspended.
    const answerNeededFor =
      first?.open === true && first.providerChargeId !== null ? first.id : null;
    if (answerNeededFor !== null && ctx.verifiedUnpaidChargeId !== answerNeededFor) {
      run.changes.deferred = true;
      return;
    }
    await this.suspendForNonPayment(run, 'TRIAL_SUSPENDED');
  }

  // Rule 3: the grace of a `PAST_DUE` subscription has run out (`graceUntil` when the operator set
  // one, otherwise `pastDueSince` + 14 days), unless the provider is frozen.
  private async suspendPastDue(run: SweepRun): Promise<void> {
    const { subscription, ctx } = run;
    if (ctx.frozen || !subscription.isGraceOver(ctx.now)) return;
    await this.suspendForNonPayment(run, 'GRACE_SUSPENDED');
  }

  // Every `NON_PAYMENT` suspension cancels the stale open charge (locally here, at the provider
  // after commit) and issues the one recovery charge (UC-115 rule 3, UC-134). A `RECOVERY` charge
  // that is somehow already open is left alone: the planner then adds none.
  private async suspendForNonPayment(
    run: SweepRun,
    step: 'TRIAL_SUSPENDED' | 'GRACE_SUSPENDED',
  ): Promise<void> {
    const { subscription, ctx } = run;
    if (!subscription.suspendForNonPayment(ctx.now, ctx.correlationId, ctx.recipientEmail)) return;
    run.subscriptionMoved(step);
    await this.cancelStale(run);
    run.changes.recovery = await this.planner.plan(subscription, ctx.now, ctx.priceCache);
  }

  private async cancelStale(run: SweepRun): Promise<void> {
    const open = await this.charges.findOpenByTenant(run.subscription.tenantId);
    await mapSequentially(
      open.filter((candidate) => candidate.kind !== 'RECOVERY'),
      async (candidate) => {
        const charge = await run.lock(candidate.id);
        if (!charge?.open) return;
        charge.cancel();
        if (charge.providerChargeId !== null) {
          charge.markProviderCancelPending();
          run.changes.cancelAtProvider.push(charge.id);
        }
        run.changed(charge);
      },
    );
  }
}
