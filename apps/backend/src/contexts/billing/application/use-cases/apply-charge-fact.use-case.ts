import { Inject, Injectable } from '@nestjs/common';
import { utcDateToLocalDate } from '../../../../shared/utils/calendar-date';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { CalendarDate } from '../../../../shared/value-objects/calendar-date.vo';
import type { Charge } from '../../domain/charge.aggregate';
import type { ProviderEvent } from '../../domain/provider-event';
import { RecoveryChargeFactory, recoveryPriceKey } from '../../domain/recovery-charge.factory';
import type { Subscription } from '../../domain/subscription.aggregate';
import { MinorAmount } from '../../domain/value-objects/minor-amount.vo';
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
import { GetFeaturePriceAtUseCase } from './get-feature-price-at.use-case';

export interface ApplyChargeFactUseCaseInput {
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

export type ApplyChargeFactUseCaseResult = ChargeFactResult | 'DUPLICATE' | 'CHARGE_NOT_FOUND';

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
export class ApplyChargeFactUseCase {
  private readonly logger = new AppLogger(ApplyChargeFactUseCase.name);

  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(CHARGE_REPOSITORY) private readonly charges: IChargeRepository,
    @Inject(PROVIDER_EVENT_REPOSITORY) private readonly providerEvents: IProviderEventRepository,
    private readonly prices: GetFeaturePriceAtUseCase,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(input: ApplyChargeFactUseCaseInput): Promise<ApplyChargeFactUseCaseResult> {
    return this.txManager.run(async () => {
      if (input.inbox && !(await this.providerEvents.insertIfAbsent(input.inbox))) {
        return 'DUPLICATE';
      }
      const subscription = await loadSubscriptionForUpdate(this.subscriptions, input.tenantId);
      const charge = await this.charges.findByIdForUpdate(input.tenantId, input.chargeId);
      if (charge === null) return 'CHARGE_NOT_FOUND';
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
      return outcome.result;
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
      return { cancelledRecovery: null, newRecovery: await this.buildRecovery(subscription, now) };
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
    if (locked === null || !locked.open) return null;
    locked.cancel();
    if (locked.providerChargeId !== null) locked.markProviderCancelPending();
    return locked;
  }

  // A reversal suspends with `PAYMENT_REVERSED`: the recovery charge is inserted `PENDING` here, in
  // the same transaction; creating it at the provider is the creation retry's job after commit.
  private async buildRecovery(subscription: Subscription, now: Date): Promise<Charge | null> {
    const existing = await this.charges.findOpenRecoveryBySubscription(
      subscription.tenantId,
      subscription.id,
    );
    if (existing !== null) return null;
    const today = utcDateToLocalDate(now, subscription.timezone.value);
    const items = subscription.selection;
    const prices = new Map<string, MinorAmount>();
    for (const item of items) {
      const price = await this.prices.execute({
        featureKey: item.featureKey,
        countryCode: subscription.countryCode.value,
        tier: item.tier,
        cycle: 'MONTHLY',
        at: today,
      });
      prices.set(
        recoveryPriceKey(item.featureKey, item.tier),
        MinorAmount.create(price.amountMinor, price.currency),
      );
    }
    return RecoveryChargeFactory.build({
      subscription,
      items,
      prices,
      today: CalendarDate.create(today),
    });
  }

  private logOutcome(input: ApplyChargeFactUseCaseInput, outcome: ChargeFactOutcome): void {
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
