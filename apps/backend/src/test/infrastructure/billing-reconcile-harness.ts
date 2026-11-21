import { ReconcileChargesJob } from '../../contexts/billing/application/jobs/reconcile-charges.job';
import { ChargeProviderSyncService } from '../../contexts/billing/application/services/charge-provider-sync.service';
import { ReconcileOneChargeUseCase } from '../../contexts/billing/application/use-cases/reconcile-one-charge.use-case';
import { RecordReconcilePassUseCase } from '../../contexts/billing/application/use-cases/record-reconcile-pass.use-case';
import { RefreshChargeFromProviderUseCase } from '../../contexts/billing/application/use-cases/refresh-charge-from-provider.use-case';
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
  const refresh = new RefreshChargeFromProviderUseCase(sync, base.charges);
  const reconcile = new ReconcileChargesJob(
    base.subscriptions,
    base.charges,
    base.health,
    base.clock,
    reconcileOne,
    retryCancel,
    recordPass,
  );
  return { ...base, registry, sync, reconcileOne, retryCancel, recordPass, refresh, reconcile };
}
