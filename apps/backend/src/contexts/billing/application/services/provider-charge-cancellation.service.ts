import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { mapSequentially } from '../../../../shared/utils/sequential';
import type { Charge } from '../../domain/charge.aggregate';
import { ChargeAlreadyPaidError } from '../../domain/errors/billing-provider.errors';
import type { Subscription } from '../../domain/subscription.aggregate';
import { resolveBillingRecipientEmail } from '../helpers/billing-recipient-email.helper';
import { paidFactFromStatus } from '../helpers/charge-status-verification';
import {
  BILLING_ACCOUNT_REPOSITORY,
  IBillingAccountRepository,
} from '../ports/billing-account-repository.port';
import {
  BILLING_PROVIDER_REGISTRY,
  type BillingProviderPort,
  type BillingProviderRegistryPort,
} from '../ports/billing-provider.port';
import { CHARGE_REPOSITORY, IChargeRepository } from '../ports/charge-repository.port';
import {
  ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../ports/subscription-repository.port';
import { ApplyChargeFactService } from './apply-charge-fact.service';

export interface CancelProviderChargesCommand {
  tenantId: string;
  /** Charges the caller already cancelled locally and flagged `provider_cancel_pending`, in its own transaction. */
  chargeIds: readonly string[];
  correlationId: string;
}

/**
 * What became of each charge. `CANCELLED`: the provider cancelled it and the flag is cleared.
 * `PAID`: the provider refused because it was just paid, so that charge is the payment and went
 * through `ApplyChargeFactService` (UC-114 step 4). `LEFT_FLAGGED`: every other failure; the flag
 * stays and reconcile (M26-S07) retries. `SKIPPED`: nothing to do at the provider (not flagged,
 * or the provider never knew the charge).
 */
export interface CancelProviderChargesResult {
  cancelled: number;
  paid: number;
  leftFlagged: number;
  skipped: number;
}

type CancelOutcome = 'CANCELLED' | 'PAID' | 'LEFT_FLAGGED' | 'SKIPPED';

/**
 * The provider side of cancelling charges, shared by the status sweep (a suspension cancels the
 * stale open charge, UC-115) and the later cancel, plan-change and exempt paths (M26-S19, S20,
 * M25-S15b's exempt hook). The **local** cancel and its `provider_cancel_pending` flag are the
 * caller's, written in the transaction that made the decision; this runs after that commit, outside
 * any transaction except the last short one (B-C1 alone, `docs/LOCK_CATALOG.md`): cancel at the
 * provider, then clear the flag. It never throws: one charge's failure never stops the others, and
 * a charge left flagged is retried by reconcile.
 */
@Injectable()
export class ProviderChargeCancellationService {
  private readonly logger = new AppLogger(ProviderChargeCancellationService.name);

  constructor(
    @Inject(BILLING_PROVIDER_REGISTRY) private readonly registry: BillingProviderRegistryPort,
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(BILLING_ACCOUNT_REPOSITORY) private readonly accounts: IBillingAccountRepository,
    @Inject(CHARGE_REPOSITORY) private readonly charges: IChargeRepository,
    private readonly applyFact: ApplyChargeFactService,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(input: CancelProviderChargesCommand): Promise<CancelProviderChargesResult> {
    const result = { cancelled: 0, paid: 0, leftFlagged: 0, skipped: 0 };
    const subscription = await this.subscriptions.findByTenantId(input.tenantId);
    if (subscription === null) return { ...result, skipped: input.chargeIds.length };
    const outcomes = await mapSequentially(input.chargeIds, (chargeId) =>
      this.cancelOne(subscription, chargeId, input).catch((err: unknown): CancelOutcome => {
        this.logFailure(input.tenantId, chargeId, err);
        return 'LEFT_FLAGGED';
      }),
    );
    for (const outcome of outcomes) {
      if (outcome === 'CANCELLED') result.cancelled += 1;
      else if (outcome === 'PAID') result.paid += 1;
      else if (outcome === 'LEFT_FLAGGED') result.leftFlagged += 1;
      else result.skipped += 1;
    }
    return result;
  }

  private async cancelOne(
    subscription: Subscription,
    chargeId: string,
    input: CancelProviderChargesCommand,
  ): Promise<CancelOutcome> {
    const charge = await this.charges.findById(input.tenantId, chargeId);
    if (charge === null || !charge.providerCancelPending || charge.providerChargeId === null) {
      return 'SKIPPED';
    }
    const adapter = this.registry.resolve(subscription.merchantProfileKey);
    try {
      await adapter.cancelCharge(charge.providerChargeId);
    } catch (err) {
      if (!(err instanceof ChargeAlreadyPaidError)) throw err;
      return this.settlePaid(adapter, subscription, charge, input);
    }
    await this.clearFlag(input.tenantId, chargeId);
    return 'CANCELLED';
  }

  // The provider refused because the charge was just paid: it is the payment, applied through the
  // one shared service once the provider confirms it (a re-read, never the refusal alone). A re-read
  // that does not confirm leaves the flag for reconcile.
  private async settlePaid(
    adapter: BillingProviderPort,
    subscription: Subscription,
    charge: Charge,
    input: CancelProviderChargesCommand,
  ): Promise<CancelOutcome> {
    const status = await adapter.fetchChargeStatus(charge.providerChargeId!);
    const fact = paidFactFromStatus(status, charge, this.clock.now());
    if (fact === null) return 'LEFT_FLAGGED';
    const account = await this.accounts.findByTenantId(input.tenantId);
    await this.applyFact.execute({
      tenantId: input.tenantId,
      chargeId: charge.id,
      fact,
      recipientEmail: resolveBillingRecipientEmail(subscription.exempt, account),
      correlationId: input.correlationId,
    });
    return 'PAID';
  }

  // B-C1 alone, on a fresh read: a webhook can have settled the charge since it was cancelled.
  private async clearFlag(tenantId: string, chargeId: string): Promise<void> {
    await this.txManager.run(async () => {
      const locked = await this.charges.findByIdForUpdate(tenantId, chargeId);
      if (locked === null) return;
      locked.clearProviderCancelPending();
      await this.charges.save(locked);
    });
  }

  private logFailure(tenantId: string, chargeId: string, err: unknown): void {
    this.logger.warn('billing_provider_cancel_failed: left flagged for the retry', {
      tenantId,
      chargeId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
