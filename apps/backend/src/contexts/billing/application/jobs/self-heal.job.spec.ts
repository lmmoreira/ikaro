import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { ProviderHealthBuilder, SubscriptionBuilder } from '../../../../test/builders/billing';
import {
  createSelfHealHarness,
  SWEEP_NOW,
} from '../../../../test/infrastructure/billing-self-heal-harness';

describe('SelfHealJob (UC-140)', () => {
  let h: ReturnType<typeof createSelfHealHarness>;

  beforeEach(() => {
    h = createSelfHealHarness();
  });

  const run = () => h.selfHeal.run({ correlationId: 'corr-1' });

  const seedOldTenantWithoutSubscription = (): string => {
    const tenantId = uuidv7();
    h.platform.seed({
      tenantId,
      slug: `t-${tenantId.slice(-8)}`,
      countryCode: 'BR',
      timezone: 'America/Sao_Paulo',
      createdAt: new Date(SWEEP_NOW.getTime() - 3_600_000),
      isActive: true,
    });
    return tenantId;
  };

  it('runs the four steps and returns each result', async () => {
    const tenantId = seedOldTenantWithoutSubscription();
    await h.subscriptions.save(new SubscriptionBuilder().build());

    const result = await run();

    expect(result.repair).toMatchObject({ ok: true, value: { repaired: 1 } });
    expect(result.release).toEqual({ ok: true, value: { released: 0 } });
    expect(result.health).toMatchObject({ ok: true });
    expect(result.freeze).toMatchObject({ ok: true });
    expect(await h.subscriptions.findByTenantId(tenantId)).not.toBeNull();
  });

  it('one step failing does not stop the others, and the run rethrows the failure afterwards', async () => {
    const tenantId = seedOldTenantWithoutSubscription();
    await h.subscriptions.save(new SubscriptionBuilder().build());
    jest.spyOn(h.release, 'execute').mockRejectedValue(new Error('db down'));
    const health = jest.spyOn(h.checkHealth, 'execute');

    await expect(run()).rejects.toThrow('db down');

    expect(await h.subscriptions.findByTenantId(tenantId)).not.toBeNull();
    expect(health).toHaveBeenCalled();
  });

  it('a failing repair does not stop the release, health or freeze steps', async () => {
    seedOldTenantWithoutSubscription();
    await h.subscriptions.save(new SubscriptionBuilder().build());
    jest.spyOn(h.repair, 'execute').mockRejectedValue(new Error('platform down'));
    const release = jest.spyOn(h.release, 'execute');
    const freeze = jest.spyOn(h.evaluateFreeze, 'execute');

    await expect(run()).rejects.toThrow('platform down');

    expect(release).toHaveBeenCalledTimes(1);
    expect(freeze).toHaveBeenCalled();
  });

  it('a tenant whose repair fails is reported as a failed run (so the message is nacked)', async () => {
    seedOldTenantWithoutSubscription();
    await h.subscriptions.save(new SubscriptionBuilder().build());
    jest.spyOn(h.createTrial, 'execute').mockRejectedValue(new Error('no price list'));

    await expect(run()).rejects.toThrow('no price list');
  });

  it('with the freeze active, the status sweep suspends nobody until a reconcile success clears it', async () => {
    const subscription = new SubscriptionBuilder().build();
    await h.subscriptions.save(subscription);
    await h.health.save(
      new ProviderHealthBuilder()
        .withMerchantProfileKey(subscription.merchantProfileKey)
        .withLastReconcileOkAt(new Date(SWEEP_NOW.getTime() - 30 * 3_600_000))
        .build(),
    );

    await run();
    expect(await h.health.listFrozenKeys()).toEqual([subscription.merchantProfileKey]);

    await h.health.recordReconcileOk(
      subscription.merchantProfileKey,
      new Date(SWEEP_NOW.getTime() + 60_000),
      false,
    );
    h.clock.advanceMs(120_000);
    await run();
    expect(await h.health.listFrozenKeys()).toEqual([]);
  });

  it('no subscription and no provider_health row anywhere: nothing is frozen', async () => {
    await run();

    expect(await h.health.listFrozenKeys()).toEqual([]);
    expect(h.health.saved).toHaveLength(0);
  });

  describe('a provider account no adapter serves yet (a staging sandbox key before M26-S37)', () => {
    it('is skipped and logged at warn: the run succeeds and only the served account is checked', async () => {
      const warn = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
      const error = jest.spyOn(AppLogger.prototype, 'error').mockImplementation();
      await h.subscriptions.save(new SubscriptionBuilder().build());
      await h.subscriptions.save(
        new SubscriptionBuilder().withMerchantProfileKey('BRL_ASAAS_SANDBOX').build(),
      );
      const health = jest.spyOn(h.checkHealth, 'execute');
      const freeze = jest.spyOn(h.evaluateFreeze, 'execute');

      const result = await run();

      expect(result.health).toMatchObject({ ok: true });
      expect(result.freeze).toMatchObject({ ok: true });
      expect(health).toHaveBeenCalledTimes(1);
      expect(health).toHaveBeenCalledWith(
        expect.objectContaining({ merchantProfileKey: 'BRL_FAKE' }),
      );
      expect(freeze).toHaveBeenCalledTimes(1);
      expect(await h.health.findByKey('BRL_ASAAS_SANDBOX')).toBeNull();
      expect(warn).toHaveBeenCalledWith('billing_provider_not_supported: skipped', {
        merchantProfileKey: 'BRL_ASAAS_SANDBOX',
      });
      expect(error).not.toHaveBeenCalled();
    });
  });
});
