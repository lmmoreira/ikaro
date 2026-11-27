import { ReconcileChargesJob } from '../../contexts/billing/application/jobs/reconcile-charges.job';
import { ChargeProviderSyncService } from '../../contexts/billing/application/services/charge-provider-sync.service';
import { ProviderAccountsService } from '../../contexts/billing/application/services/provider-accounts.service';
import { ReconcileOneChargeUseCase } from '../../contexts/billing/application/use-cases/reconcile-one-charge.use-case';
import { RecordReconcilePassUseCase } from '../../contexts/billing/application/use-cases/record-reconcile-pass.use-case';
import { GetOrRegenerateChargePaymentLinkUseCase } from '../../contexts/billing/application/use-cases/get-or-regenerate-charge-payment-link.use-case';
import { RecordPaymentReturnUseCase } from '../../contexts/billing/application/use-cases/record-payment-return.use-case';
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
  // The manager's pay flow (UC-119): the on-demand refresh is the return use case's, over the sync.
  const recordReturn = new RecordPaymentReturnUseCase(
    world.charges,
    sync,
    world.txManager,
    world.clock,
  );
  const paymentLink = new GetOrRegenerateChargePaymentLinkUseCase(
    world.charges,
    world.accounts,
    world.registry,
    world.txManager,
    world.clock,
  );
  const providerAccounts = new ProviderAccountsService(world.subscriptions, world.registry);
  const reconcile = new ReconcileChargesJob(
    providerAccounts,
    world.charges,
    world.health,
    world.clock,
    reconcileOne,
    retryCancel,
    recordPass,
  );
  world.trackHealthKey('BRL_FAKE');
  // `cleanup` clears the tracked keys, and the job writes this row in every test: track it again.
  const cleanup = async (): Promise<void> => {
    await world.cleanup();
    world.trackHealthKey('BRL_FAKE');
  };
  return {
    ...world,
    cleanup,
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

export type ReconcileWorld = Awaited<ReturnType<typeof createReconcileWorld>>;
