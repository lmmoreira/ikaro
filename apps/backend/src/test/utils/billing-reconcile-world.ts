import { ReconcileChargesJob } from '../../contexts/billing/application/jobs/reconcile-charges.job';
import { ChargeProviderSyncService } from '../../contexts/billing/application/services/charge-provider-sync.service';
import { ReconcileOneChargeUseCase } from '../../contexts/billing/application/use-cases/reconcile-one-charge.use-case';
import { RecordReconcilePassUseCase } from '../../contexts/billing/application/use-cases/record-reconcile-pass.use-case';
import { RefreshChargeFromProviderUseCase } from '../../contexts/billing/application/use-cases/refresh-charge-from-provider.use-case';
import { RetryProviderChargeCancelUseCase } from '../../contexts/billing/application/use-cases/retry-provider-charge-cancel.use-case';
import { createSweepWorld } from './billing-sweep-world';

/**
 * Reconcile (UC-116) against Postgres: the sweep world's real repositories, row locks and fake
 * provider, with the sync service, the three use cases and the job composed over them. The merchant
 * profile key every seeded tenant uses is `BRL_FAKE`; the job writes its health row, so the world
 * removes it with the rest.
 */
export async function createReconcileWorld() {
  const world = await createSweepWorld();
  const sync = new ChargeProviderSyncService(
    world.registry,
    world.subscriptions,
    world.accounts,
    world.charges,
    world.applyFact,
    world.creation,
    world.clock,
  );
  const reconcileOne = new ReconcileOneChargeUseCase(sync);
  const retryCancel = new RetryProviderChargeCancelUseCase(world.cancellation);
  const recordPass = new RecordReconcilePassUseCase(world.registry, world.health);
  const refresh = new RefreshChargeFromProviderUseCase(sync, world.charges);
  const reconcile = new ReconcileChargesJob(
    world.subscriptions,
    world.charges,
    world.health,
    world.clock,
    reconcileOne,
    retryCancel,
    recordPass,
  );
  world.trackHealthKey('BRL_FAKE');
  return { ...world, sync, reconcileOne, retryCancel, recordPass, refresh, reconcile };
}

export type ReconcileWorld = Awaited<ReturnType<typeof createReconcileWorld>>;
