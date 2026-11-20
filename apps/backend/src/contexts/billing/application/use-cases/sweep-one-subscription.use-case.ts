import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { mapSequentially } from '../../../../shared/utils/sequential';
import type { Charge } from '../../domain/charge.aggregate';
import type { Subscription } from '../../domain/subscription.aggregate';
import { resolveBillingRecipientEmail } from '../helpers/billing-recipient-email.helper';
import { isPaidAtProvider, paidFactFromStatus } from '../helpers/charge-status-verification';
import {
  BILLING_ACCOUNT_REPOSITORY,
  IBillingAccountRepository,
} from '../ports/billing-account-repository.port';
import {
  BILLING_PROVIDER_REGISTRY,
  type BillingProviderRegistryPort,
} from '../ports/billing-provider.port';
import { CHARGE_REPOSITORY, IChargeRepository } from '../ports/charge-repository.port';
import {
  ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../ports/subscription-repository.port';
import { ApplyChargeFactService } from '../services/apply-charge-fact.service';
import { ProviderChargeCreationService } from '../services/provider-charge-creation.service';
import type { RecoveryPriceCache } from '../services/recovery-charge-planner.service';
import {
  type SweepChanges,
  type SweepContext,
  type SweepStep,
  SubscriptionSweepRules,
} from '../services/subscription-sweep-rules.service';
import { ProviderChargeCancellationService } from '../services/provider-charge-cancellation.service';

export interface SweepOneSubscriptionUseCaseInput {
  tenantId: string;
  correlationId: string;
  /** The merchant profile keys whose suspension freeze is on, read once by the job for the whole run. */
  frozenProfileKeys: ReadonlySet<string>;
  /** The price lookups the run already made, shared by every suspension in it. */
  priceCache?: RecoveryPriceCache;
}

export type SweepOneOutcome = 'NOT_FOUND' | 'EXEMPT' | 'UNCHANGED' | 'SWEPT';

export interface SweepOneSubscriptionUseCaseResult {
  outcome: SweepOneOutcome;
  steps: readonly SweepStep[];
  /** A non-payment suspension was due but waited for a provider answer; the next run tries again. */
  deferred: boolean;
}

/**
 * UC-115 for one subscription. Before the transaction: the billing email and, for a trial whose
 * margin has passed, the provider re-read of its first charge (a payment the webhook missed is
 * applied then, and the tenant is not suspended). Then one transaction, B-R1 first, in which the
 * rules re-check everything on the locked state and every change is saved together: the paid state
 * of a payment that lands during the sweep always wins, because it holds the same row lock. After
 * commit, outside any transaction: the stale charge is cancelled at the provider and the recovery
 * charge is made payable, so the manager lands on a link within the same run. A failure of either
 * leaves the charge for the retry (reconcile for the cancel, the creation retry for the recovery).
 */
@Injectable()
export class SweepOneSubscriptionUseCase {
  private readonly logger = new AppLogger(SweepOneSubscriptionUseCase.name);

  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(CHARGE_REPOSITORY) private readonly charges: IChargeRepository,
    @Inject(BILLING_ACCOUNT_REPOSITORY) private readonly accounts: IBillingAccountRepository,
    @Inject(BILLING_PROVIDER_REGISTRY) private readonly registry: BillingProviderRegistryPort,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(CLOCK) private readonly clock: IClock,
    private readonly rules: SubscriptionSweepRules,
    private readonly applyFact: ApplyChargeFactService,
    private readonly cancellation: ProviderChargeCancellationService,
    private readonly creation: ProviderChargeCreationService,
  ) {}

  async execute(
    input: SweepOneSubscriptionUseCaseInput,
  ): Promise<SweepOneSubscriptionUseCaseResult> {
    const { tenantId } = input;
    const snapshot = await this.subscriptions.findByTenantId(tenantId);
    if (snapshot === null) return { outcome: 'NOT_FOUND', steps: [], deferred: false };
    if (snapshot.exempt) return { outcome: 'EXEMPT', steps: [], deferred: false };
    const account = await this.accounts.findByTenantId(tenantId);
    const base: SweepContext = {
      now: this.clock.now(),
      correlationId: input.correlationId,
      recipientEmail: resolveBillingRecipientEmail(snapshot.exempt, account),
      frozen: input.frozenProfileKeys.has(snapshot.merchantProfileKey),
      verifiedUnpaidChargeId: null,
      priceCache: input.priceCache,
    };
    const verifiedUnpaidChargeId = await this.askProviderAboutFirstCharge(snapshot, base);
    const changes = await this.sweepLocked(tenantId, { ...base, verifiedUnpaidChargeId });
    if (changes === null) return { outcome: 'NOT_FOUND', steps: [], deferred: false };
    await this.afterCommit(tenantId, changes, input.correlationId);
    if (changes.steps.length > 0) {
      this.logger.log('billing_subscription_swept', {
        tenantId,
        correlationId: input.correlationId,
        steps: changes.steps,
      });
    }
    return {
      outcome: changes.steps.length > 0 ? 'SWEPT' : 'UNCHANGED',
      steps: changes.steps,
      deferred: changes.deferred,
    };
  }

  // Rule 2's re-read, **before** the transaction opens (provider I/O is never inside one). Only a
  // trial whose margin has passed, not frozen, with a first charge the provider knows, is asked.
  // Answers the id of the charge the provider did not report paid; `null` when no answer is needed
  // or none could be had (an unreachable provider, an answer that does not describe this charge):
  // the rules then leave the suspension for the next run.
  private async askProviderAboutFirstCharge(
    snapshot: Subscription,
    ctx: SweepContext,
  ): Promise<string | null> {
    if (ctx.frozen || !snapshot.hasTrialEnded(ctx.now)) return null;
    const first = await this.charges.findFirstPeriodCharge(snapshot.tenantId, snapshot.id);
    if (first === null || !first.open || first.providerChargeId === null) return null;
    if (!snapshot.isTrialSettlementOver(ctx.now, first.paymentReturnSeenAt !== null)) return null;
    try {
      return await this.verifyUnpaid(snapshot, first, first.providerChargeId, ctx);
    } catch (err) {
      this.logger.warn('billing_sweep_provider_reread_failed: left for the next run', {
        tenantId: snapshot.tenantId,
        chargeId: first.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  private async verifyUnpaid(
    snapshot: Subscription,
    first: Charge,
    providerChargeId: string,
    ctx: SweepContext,
  ): Promise<string | null> {
    const status = await this.registry
      .resolve(snapshot.merchantProfileKey)
      .fetchChargeStatus(providerChargeId);
    const paid = paidFactFromStatus(status, first, ctx.now);
    if (paid !== null) {
      // The webhook was missed: the payment is applied now and the rules find the charge paid.
      await this.applyFact.execute({
        tenantId: snapshot.tenantId,
        chargeId: first.id,
        fact: paid,
        recipientEmail: ctx.recipientEmail,
        correlationId: ctx.correlationId,
      });
      return null;
    }
    // Paid at the provider but not matching this charge (amount, reference): never trusted either way.
    return isPaidAtProvider(status) ? null : first.id;
  }

  // One transaction, B-R1 first. The saves stay inline in this callback (the `transactional-save`
  // rule); every read and decision is in the rules service.
  private async sweepLocked(tenantId: string, ctx: SweepContext): Promise<SweepChanges | null> {
    return this.txManager.run(async () => {
      const subscription = await this.subscriptions.findByTenantIdForUpdate(tenantId);
      if (subscription === null || subscription.exempt) return null;
      const changes = await this.rules.apply(subscription, ctx);
      await mapSequentially(changes.charges, (charge) => this.charges.save(charge));
      if (changes.subscriptionChanged) await this.subscriptions.save(subscription);
      if (changes.recovery) await this.charges.save(changes.recovery);
      return changes;
    });
  }

  private async afterCommit(
    tenantId: string,
    changes: SweepChanges,
    correlationId: string,
  ): Promise<void> {
    if (changes.cancelAtProvider.length > 0) {
      await this.cancellation
        .execute({ tenantId, chargeIds: changes.cancelAtProvider, correlationId })
        .catch((err: unknown) => this.logAfterCommitFailure('cancel', tenantId, err));
    }
    if (changes.recovery !== null) {
      await this.creation
        .execute({ tenantId, chargeId: changes.recovery.id, correlationId })
        .catch((err: unknown) => this.logAfterCommitFailure('recovery creation', tenantId, err));
    }
  }

  private logAfterCommitFailure(what: string, tenantId: string, err: unknown): void {
    this.logger.error(
      `billing_sweep_${what.replace(' ', '_')}_failed: left for the retry`,
      err instanceof Error ? err.stack : String(err),
      { tenantId },
    );
  }
}
