import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import type { Charge } from '../../domain/charge.aggregate';
import type { Subscription } from '../../domain/subscription.aggregate';
import type { ChargeFact } from '../helpers/charge-fact';
import { resolveBillingRecipientEmail } from '../helpers/billing-recipient-email.helper';
import { chargeStatusMismatch, factFromStatus } from '../helpers/charge-status-verification';
import { createRecoveryChargeAtProvider } from '../helpers/create-recovery-at-provider';
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
import { ApplyChargeFactService } from './apply-charge-fact.service';
import { ProviderChargeCreationService } from './provider-charge-creation.service';

export interface SyncChargeCommand {
  tenantId: string;
  chargeId: string;
  correlationId: string;
}

/**
 * What one provider read of a charge led to. `APPLIED`: the provider's state differed from ours
 * and the shared apply changed it (a drift, fixed). `NO_CHANGE`: the provider confirms what we
 * hold. `ILLEGAL`: the provider's state is not reachable from ours (a refund of a charge never
 * paid), left as it is and logged. `UNCHANGED`: the provider says something that changes nothing
 * locally (still pending, overdue, cancelled). `MISMATCH`: the read does not describe our charge
 * (another amount or reference), so it was not used. `SKIPPED`: nothing to read (no provider
 * charge yet, no subscription, or the charge is gone).
 */
export type ChargeSyncOutcome =
  'APPLIED' | 'NO_CHANGE' | 'ILLEGAL' | 'UNCHANGED' | 'MISMATCH' | 'SKIPPED';

interface SyncTarget {
  charge: Charge;
  subscription: Subscription;
  providerChargeId: string;
}

export interface ChargeSyncResult {
  outcome: ChargeSyncOutcome;
  /** The provider account that answered, or `null` when no provider call was made. */
  merchantProfileKey: string | null;
}

/**
 * The provider read behind reconcile and the on-demand refresh (UC-116): fetch the charge's status,
 * check it describes our charge, and hand the fact it states to `ApplyChargeFactService`, the one
 * place a paid, refunded or charged-back fact becomes a local change (M26-D1). The provider call is
 * made before any transaction opens; only the apply is transactional. A reversal inserts its
 * `RECOVERY` charge `PENDING` in that transaction, and this makes it payable at the provider after
 * the commit, as the webhook does. A provider error is the caller's: it propagates, so a job can
 * count it and the on-demand path can swallow it.
 */
@Injectable()
export class ChargeProviderSyncService {
  private readonly logger = new AppLogger(ChargeProviderSyncService.name);

  constructor(
    @Inject(BILLING_PROVIDER_REGISTRY) private readonly registry: BillingProviderRegistryPort,
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(BILLING_ACCOUNT_REPOSITORY) private readonly accounts: IBillingAccountRepository,
    @Inject(CHARGE_REPOSITORY) private readonly charges: IChargeRepository,
    private readonly applyFact: ApplyChargeFactService,
    @Inject(ProviderChargeCreationService)
    private readonly creation: Pick<ProviderChargeCreationService, 'execute'>,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async sync(command: SyncChargeCommand): Promise<ChargeSyncResult> {
    const target = await this.load(command);
    if (target === null) return { outcome: 'SKIPPED', merchantProfileKey: null };
    const { charge, subscription } = target;
    const merchantProfileKey = subscription.merchantProfileKey;
    const adapter = this.registry.resolve(merchantProfileKey);
    const status = await adapter.fetchChargeStatus(target.providerChargeId);
    const mismatch = chargeStatusMismatch(status, charge);
    if (mismatch !== null) {
      this.logger.warn('billing_reconcile_mismatch', { ...this.ids(command), mismatch });
      return { outcome: 'MISMATCH', merchantProfileKey };
    }
    const fact = factFromStatus(status, this.clock.now());
    if (fact === null) {
      this.logUnappliedDrift(command, charge.status, status.state);
      return { outcome: 'UNCHANGED', merchantProfileKey };
    }
    const outcome = await this.apply(command, target, fact);
    if (outcome === 'APPLIED') {
      this.logger.warn('billing_reconcile_drift', {
        ...this.ids(command),
        localStatus: charge.status,
        providerState: status.state,
      });
    }
    return { outcome, merchantProfileKey };
  }

  // The charge and its subscription, when there is a provider charge to read (a charge still waiting
  // for the provider has none, and is the creation retry's).
  private async load(command: SyncChargeCommand): Promise<SyncTarget | null> {
    const charge = await this.charges.findById(command.tenantId, command.chargeId);
    const subscription = await this.subscriptions.findByTenantId(command.tenantId);
    if (charge === null || subscription === null || charge.providerChargeId === null) return null;
    return { charge, subscription, providerChargeId: charge.providerChargeId };
  }

  // The shared apply, then, for a reversal, the recovery charge it inserted made payable at the
  // provider: after the commit, outside any transaction.
  private async apply(
    command: SyncChargeCommand,
    target: SyncTarget,
    fact: ChargeFact,
  ): Promise<ChargeSyncOutcome> {
    const account = await this.accounts.findByTenantId(command.tenantId);
    const report = await this.applyFact.executeWithReport({
      tenantId: command.tenantId,
      chargeId: command.chargeId,
      fact,
      recipientEmail: resolveBillingRecipientEmail(target.subscription.exempt, account),
      correlationId: command.correlationId,
    });
    if (report.recoveryChargeId !== null) {
      await createRecoveryChargeAtProvider(this.creation, this.logger, {
        tenantId: command.tenantId,
        chargeId: report.recoveryChargeId,
        correlationId: command.correlationId,
      });
    }
    if (report.result === 'CHARGE_NOT_FOUND') return 'SKIPPED';
    return report.result === 'DUPLICATE' ? 'NO_CHANGE' : report.result;
  }

  private ids(command: SyncChargeCommand): { tenantId: string; chargeId: string } {
    return { tenantId: command.tenantId, chargeId: command.chargeId };
  }

  // An open local charge the provider has cancelled changes nothing here (a cancel is ours to make
  // and the provider's cancel is only ever the retry's own), but it is a drift worth seeing.
  private logUnappliedDrift(command: SyncChargeCommand, localStatus: string, state: string): void {
    if (state === 'CANCELED' && (localStatus === 'PENDING' || localStatus === 'OVERDUE')) {
      this.logger.warn('billing_reconcile_drift_unapplied', {
        tenantId: command.tenantId,
        chargeId: command.chargeId,
        localStatus,
        providerState: state,
      });
    }
  }
}
