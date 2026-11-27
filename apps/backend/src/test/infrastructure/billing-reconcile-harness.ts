import { ReconcileChargesJob } from '../../contexts/billing/application/jobs/reconcile-charges.job';
import { ChargeProviderSyncService } from '../../contexts/billing/application/services/charge-provider-sync.service';
import { ProviderAccountsService } from '../../contexts/billing/application/services/provider-accounts.service';
import { ReconcileOneChargeUseCase } from '../../contexts/billing/application/use-cases/reconcile-one-charge.use-case';
import { RecordReconcilePassUseCase } from '../../contexts/billing/application/use-cases/record-reconcile-pass.use-case';
import { GetOrRegenerateChargePaymentLinkUseCase } from '../../contexts/billing/application/use-cases/get-or-regenerate-charge-payment-link.use-case';
import { RecordPaymentReturnUseCase } from '../../contexts/billing/application/use-cases/record-payment-return.use-case';
import { RetryProviderChargeCancelUseCase } from '../../contexts/billing/application/use-cases/retry-provider-charge-cancel.use-case';
import { BillingProviderRegistry } from '../../contexts/billing/infrastructure/providers/billing-provider.registry';
import { createSweepHarness } from './billing-sweep-harness';

export { SWEEP_NOW } from './billing-sweep-harness';

/**
 * The in-memory wiring of reconcile (UC-116) on top of the sweep harness: the same fake provider,
 * repositories, shared apply and creation service, with the sync service, the three use cases and
 * the job over them. A spec makes the provider say something the local state does not know with
 * `provider.simulatePayment(...)` and never drains the webhook the fake queued: a dropped webhook.
 */
export function createReconcileHarness() {
  const base = createSweepHarness();
  const registry = new BillingProviderRegistry('local', base.provider);
  const sync = new ChargeProviderSyncService(
    registry,
    base.subscriptions,
    base.accounts,
    base.charges,
    base.applyFact,
    base.creation,
    base.clock,
  );
  const reconcileOne = new ReconcileOneChargeUseCase(sync);
  const retryCancel = new RetryProviderChargeCancelUseCase(base.cancellation);
  const recordPass = new RecordReconcilePassUseCase(registry, base.health);
  // The manager's pay flow (UC-119): the on-demand refresh is the return use case's, over the sync.
  const recordReturn = new RecordPaymentReturnUseCase(
    base.charges,
    sync,
    base.txManager,
    base.clock,
  );
  const paymentLink = new GetOrRegenerateChargePaymentLinkUseCase(
    base.charges,
    base.accounts,
    registry,
    base.txManager,
    base.clock,
  );
  const providerAccounts = new ProviderAccountsService(base.subscriptions, registry);
  const reconcile = new ReconcileChargesJob(
    providerAccounts,
    base.charges,
    base.health,
    base.clock,
    reconcileOne,
    retryCancel,
    recordPass,
  );
  return {
    ...base,
    registry,
    providerAccounts,
    sync,
    reconcileOne,
    retryCancel,
    recordPass,
    recordReturn,
    paymentLink,
    reconcile,
  };
}
