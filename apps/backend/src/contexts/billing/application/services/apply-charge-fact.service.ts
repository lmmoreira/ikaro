import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import type { Charge } from '../../domain/charge.aggregate';
import type { ProviderEvent } from '../../domain/provider-event';
import type { Subscription } from '../../domain/subscription.aggregate';
import {
  applyChargeFact,
  type ChargeFact,
  type ChargeFactContext,
  type ChargeFactOutcome,
  type ChargeFactResult,
} from '../helpers/charge-fact';
import { loadSubscriptionForUpdate } from '../helpers/operator-billing.helpers';
import { CHARGE_REPOSITORY, IChargeRepository } from '../ports/charge-repository.port';
import {
  IProviderEventRepository,
  PROVIDER_EVENT_REPOSITORY,
} from '../ports/provider-event-repository.port';
import {
  ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../ports/subscription-repository.port';
import { RecoveryChargePlanner } from './recovery-charge-planner.service';

export interface ApplyChargeFactInput {
  tenantId: string;
  chargeId: string;
  fact: ChargeFact;
  /** The billing email resolved before the transaction (`resolveBillingRecipientEmail`). */
  recipientEmail: string | null;
  correlationId: string;
  /**
   * The webhook inbox row, inserted as the first write of the same transaction (UC-114 step 2):
   * `DUPLICATE` when it was already there. Reconcile and the other callers pass none.
   */
  inbox?: ProviderEvent;
}

export type ApplyChargeFactResult = ChargeFactResult | 'DUPLICATE' | 'CHARGE_NOT_FOUND';

export interface ApplyChargeFactReport {
  result: ApplyChargeFactResult;
  /** The `RECOVERY` charge a reversal inserted `PENDING` in the same transaction, to create at the provider after commit. */
  recoveryChargeId: string | null;
}

interface FollowUps {
  /** The open `RECOVERY` charge the stale payment made unnecessary, cancelled. */
  cancelledRecovery: Charge | null;
  /** The `RECOVERY` charge a reversal made necessary, inserted `PENDING`. */
  newRecovery: Charge | null;
}

/**
 * M26-D1: the one place a provider-verified paid / refunded / charged-back fact becomes a local
 * charge and subscription change (the webhook now, reconcile and the on-demand refresh later). One
 * transaction, B-R1 then B-C1: the subscription row, then the charge row, then the writes, each
 * aggregate draining its own events into the outbox in that transaction. It performs no provider
 * I/O: the caller re-read the provider **before** calling. The access cache is evicted by the
 * cached subscription repository after commit, so there is no explicit invalidation here.
 */
@Injectable()
export class ApplyChargeFactService {
  private readonly logger = new AppLogger(ApplyChargeFactService.name);

  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(CHARGE_REPOSITORY) private readonly charges: IChargeRepository,
    @Inject(PROVIDER_EVENT_REPOSITORY) private readonly providerEvents: IProviderEventRepository,
    private readonly planner: RecoveryChargePlanner,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(input: ApplyChargeFactInput): Promise<ApplyChargeFactResult> {
    return (await this.executeWithReport(input)).result;
  }

  /**
   * `execute`, plus what the caller needs after commit: the id of the `RECOVERY` charge a reversal
   * inserted `PENDING` in this transaction (`null` when none was). Creating it at the provider is
   * the caller's step, outside any transaction.
   */
  async executeWithReport(input: ApplyChargeFactInput): Promise<ApplyChargeFactReport> {
    return this.txManager.run(async () => {
      if (input.inbox && !(await this.providerEvents.insertIfAbsent(input.inbox))) {
        return { result: 'DUPLICATE', recoveryChargeId: null };
      }
      const subscription = await loadSubscriptionForUpdate(this.subscriptions, input.tenantId);
      const charge = await this.charges.findByIdForUpdate(input.tenantId, input.chargeId);
      if (charge === null) return { result: 'CHARGE_NOT_FOUND', recoveryChargeId: null };
      const ctx: ChargeFactContext = {
        now: this.clock.now(),
        correlationId: input.correlationId,
        recipientEmail: input.recipientEmail,
      };
      const outcome = applyChargeFact(charge, subscription, input.fact, ctx);
      const followUps = await this.followUps(outcome, subscription, ctx.now);
      if (outcome.chargeChanged) await this.charges.save(charge);
      if (outcome.subscriptionChanged) await this.subscriptions.save(subscription);
      if (followUps.cancelledRecovery) await this.charges.save(followUps.cancelledRecovery);
      if (followUps.newRecovery) await this.charges.save(followUps.newRecovery);
      this.logOutcome(input, outcome);
      return { result: outcome.result, recoveryChargeId: followUps.newRecovery?.id ?? null };
    });
  }

  // Reads and builds only (a `save()` stays inline in `execute`'s transaction callback).
  private async followUps(
    outcome: ChargeFactOutcome,
    subscription: Subscription,
    now: Date,
  ): Promise<FollowUps> {
    if (outcome.staleRecoveryPaid) {
      return { cancelledRecovery: await this.cancelOpenRecovery(subscription), newRecovery: null };
    }
    if (outcome.suspendedByReversal) {
      return { cancelledRecovery: null, newRecovery: await this.planner.plan(subscription, now) };
    }
    return { cancelledRecovery: null, newRecovery: null };
  }

  // The stale charge was the payment (UC-114 step 4): the recovery charge issued next to it is
  // cancelled locally; when it already reached the provider, the retry job cancels it there.
  private async cancelOpenRecovery(subscription: Subscription): Promise<Charge | null> {
    const open = await this.charges.findOpenRecoveryBySubscription(
      subscription.tenantId,
      subscription.id,
    );
    if (open === null) return null;
    const locked = await this.charges.findByIdForUpdate(subscription.tenantId, open.id);
    if (!locked?.open) return null;
    locked.cancel();
    if (locked.providerChargeId !== null) locked.markProviderCancelPending();
    return locked;
  }

  private logOutcome(input: ApplyChargeFactInput, outcome: ChargeFactOutcome): void {
    const context = {
      tenantId: input.tenantId,
      chargeId: input.chargeId,
      fact: input.fact.type,
      result: outcome.result,
    };
    if (outcome.result === 'ILLEGAL') {
      this.logger.warn('billing_charge_fact_illegal: left to reconcile', context);
    }
    if (outcome.doublePaid) {
      this.logger.warn(
        'billing_double_payment: refund the second payment in the provider console',
        context,
      );
    }
  }
}
