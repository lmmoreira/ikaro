import { ProviderHealthBuilder } from '../../../../test/builders/billing';
import { InMemoryProviderHealthRepository } from '../../../../test/repositories/billing/in-memory-provider-health.repository';
import { EvaluateSuspensionFreezeUseCase } from './evaluate-suspension-freeze.use-case';

const KEY = 'BRL_FAKE';
const NOW = new Date('2026-03-10T15:00:00Z');
const hoursAgo = (hours: number): Date => new Date(NOW.getTime() - hours * 3_600_000);

describe('EvaluateSuspensionFreezeUseCase (UC-140 step 3)', () => {
  let health: InMemoryProviderHealthRepository;
  let useCase: EvaluateSuspensionFreezeUseCase;

  beforeEach(() => {
    health = new InMemoryProviderHealthRepository();
    useCase = new EvaluateSuspensionFreezeUseCase(health);
  });

  const evaluate = () => useCase.execute({ merchantProfileKey: KEY, now: NOW, correlationId: 'c' });
  const seed = (builder: ProviderHealthBuilder) =>
    health.save(builder.withMerchantProfileKey(KEY).build());

  it('no provider_health row means not frozen, and nothing is written', async () => {
    await expect(evaluate()).resolves.toMatchObject({ frozen: false, change: 'NONE' });
    expect(health.saved).toHaveLength(0);
  });

  it('a row whose last reconcile success is NULL counts from updated_at', async () => {
    await seed(new ProviderHealthBuilder().withLastReconcileOkAt(null).withUpdatedAt(hoursAgo(25)));

    await expect(evaluate()).resolves.toMatchObject({
      frozen: true,
      change: 'SET',
      reason: 'RECONCILE_STALE',
    });
  });

  it('sets the freeze when reconcile has not succeeded for more than 24 hours, both columns together', async () => {
    await seed(new ProviderHealthBuilder().withLastReconcileOkAt(hoursAgo(24.5)));

    await expect(evaluate()).resolves.toMatchObject({
      frozen: true,
      change: 'SET',
      reason: 'RECONCILE_STALE',
    });

    expect(await health.findByKey(KEY)).toMatchObject({ freezeActive: true, freezeSince: NOW });
    expect(await health.listFrozenKeys()).toEqual([KEY]);
  });

  it('does not freeze a reconcile 23 hours old', async () => {
    await seed(new ProviderHealthBuilder().withLastReconcileOkAt(hoursAgo(23)));

    await expect(evaluate()).resolves.toMatchObject({ frozen: false, change: 'NONE' });
  });

  it('one failed health read does not freeze; the second consecutive one does', async () => {
    await seed(new ProviderHealthBuilder().withHealthReadFailures(1));
    await expect(evaluate()).resolves.toMatchObject({ frozen: false });

    await seed(new ProviderHealthBuilder().withHealthReadFailures(2));
    await expect(evaluate()).resolves.toMatchObject({
      frozen: true,
      change: 'SET',
      reason: 'HEALTH_READS_FAILED',
    });
  });

  it('stays frozen while no reconcile has succeeded since the freeze started', async () => {
    await seed(
      new ProviderHealthBuilder().withLastReconcileOkAt(hoursAgo(30)).withFreeze(hoursAgo(2)),
    );

    await expect(evaluate()).resolves.toMatchObject({ frozen: true, change: 'NONE' });
  });

  it('stays frozen after a reconcile success while the latest health read still fails', async () => {
    await seed(
      new ProviderHealthBuilder()
        .withLastReconcileOkAt(hoursAgo(0.5))
        .withFreeze(hoursAgo(2))
        .withHealthReadFailures(1),
    );

    await expect(evaluate()).resolves.toMatchObject({ frozen: true, change: 'NONE' });
  });

  it('clears itself after a reconcile success newer than the freeze and a successful health read', async () => {
    await seed(
      new ProviderHealthBuilder().withLastReconcileOkAt(hoursAgo(0.5)).withFreeze(hoursAgo(2)),
    );

    await expect(evaluate()).resolves.toMatchObject({ frozen: false, change: 'CLEARED' });

    expect(await health.findByKey(KEY)).toMatchObject({ freezeActive: false, freezeSince: null });
    expect(await health.listFrozenKeys()).toEqual([]);
  });

  it('is idempotent: a second run of a set freeze changes nothing', async () => {
    await seed(new ProviderHealthBuilder().withLastReconcileOkAt(hoursAgo(30)));
    await evaluate();

    await expect(evaluate()).resolves.toMatchObject({ frozen: true, change: 'NONE' });
  });
});
