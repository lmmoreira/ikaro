import { AppLogger } from '../../../../shared/observability/app-logger';
import { ProviderHealthBuilder, SubscriptionBuilder } from '../../../../test/builders/billing';
import {
  createReconcileHarness,
  SWEEP_NOW,
} from '../../../../test/infrastructure/billing-reconcile-harness';
import type { Charge } from '../../domain/charge.aggregate';
import type { Subscription } from '../../domain/subscription.aggregate';

// SWEEP_NOW is 15:00 UTC on 2026-03-10 (12:00 in São Paulo): past the daily full-pass hour.
const KEY = 'BRL_FAKE';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

describe('ReconcileChargesJob (UC-116)', () => {
  let h: ReturnType<typeof createReconcileHarness>;

  beforeEach(() => {
    h = createReconcileHarness();
    jest.restoreAllMocks();
  });

  const run = () => h.reconcile.run({ correlationId: 'corr-reconcile' });
  const healthRow = () => h.health.findByKey(KEY);
  // A full pass already completed within the day: the run is the hourly at-risk one.
  const fullPassDone = () =>
    h.health.save(
      new ProviderHealthBuilder()
        .withMerchantProfileKey(KEY)
        .withLastFullReconcileAt(new Date(SWEEP_NOW.getTime() - HOUR_MS))
        .build(),
    );

  const tenant = async (
    status: 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'TRIALING' = 'ACTIVE',
    configure: (builder: SubscriptionBuilder) => SubscriptionBuilder = (b) => b,
  ): Promise<Subscription> => {
    const builder = new SubscriptionBuilder().withStatus(status).withItems([h.hotsiteItem()]);
    if (status === 'SUSPENDED') builder.withSuspension('NON_PAYMENT', SWEEP_NOW);
    const subscription = configure(builder).build();
    await h.seedTenant(subscription);
    return subscription;
  };

  describe('the at-risk scope (every hour)', () => {
    beforeEach(fullPassDone);

    it('reads open charges due today or earlier, open recovery charges and the charges of trials ending within 14 days, and nothing else', async () => {
      const overdue = await h.seedCharge(await tenant('PAST_DUE'), { dueDate: '2026-03-01' });
      const dueToday = await h.seedCharge(await tenant(), { dueDate: '2026-03-10' });
      const recovery = await h.seedCharge(await tenant('SUSPENDED'), {
        kind: 'RECOVERY',
        dueDate: '2026-03-15',
      });
      const endingTrial = await h.seedCharge(
        await tenant('TRIALING', (b) =>
          b.withTrialEndsAt(new Date(SWEEP_NOW.getTime() + 13 * DAY_MS)),
        ),
        { dueDate: '2026-03-23', period: ['2026-03-23', '2026-04-22'] },
      );
      const farTrial = await h.seedCharge(
        await tenant('TRIALING', (b) =>
          b.withTrialEndsAt(new Date(SWEEP_NOW.getTime() + 20 * DAY_MS)),
        ),
        { dueDate: '2026-03-30', period: ['2026-03-30', '2026-04-29'] },
      );
      const futureRenewal = await h.seedCharge(await tenant(), {
        dueDate: '2026-03-18',
        period: ['2026-03-18', '2026-04-17'],
      });
      h.charges.trialEnds.set(
        `${endingTrial.tenantId}|${endingTrial.subscriptionId}`,
        new Date(SWEEP_NOW.getTime() + 13 * DAY_MS),
      );
      h.charges.trialEnds.set(
        `${farTrial.tenantId}|${farTrial.subscriptionId}`,
        new Date(SWEEP_NOW.getTime() + 20 * DAY_MS),
      );
      const spy = jest.spyOn(h.provider, 'fetchChargeStatus');

      const result = await run();

      const read = spy.mock.calls.map(([id]) => id).sort();
      expect(result.scope).toBe('AT_RISK');
      expect(read).toEqual(
        [overdue, dueToday, recovery, endingTrial].map((c) => c.providerChargeId!).sort(),
      );
      expect(read).not.toContain(farTrial.providerChargeId);
      expect(read).not.toContain(futureRenewal.providerChargeId);
      expect(result.checked).toBe(4);
    });

    it('reads the provider 10 charges at a time, never more', async () => {
      for (let day = 1; day <= 12; day += 1) {
        const subscription = await tenant('PAST_DUE');
        await h.seedCharge(subscription, { dueDate: `2026-03-0${Math.min(day, 9)}` });
      }
      let inFlight = 0;
      let peak = 0;
      const original = h.provider.fetchChargeStatus.bind(h.provider);
      jest.spyOn(h.provider, 'fetchChargeStatus').mockImplementation(async (id) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setImmediate(resolve));
        inFlight -= 1;
        return original(id);
      });

      const result = await run();

      expect(result.checked).toBe(12);
      expect(peak).toBe(10);
    });

    it('a charge two selections both return (a recovery charge already due) is read once', async () => {
      await h.seedCharge(await tenant('SUSPENDED'), { kind: 'RECOVERY', dueDate: '2026-03-01' });
      const spy = jest.spyOn(h.provider, 'fetchChargeStatus');

      const result = await run();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(result.checked).toBe(1);
    });

    it('a payment whose webhook was missed is applied before the sweep can turn the tenant PAST_DUE', async () => {
      const subscription = await tenant();
      const charge = await h.seedCharge(subscription, {
        dueDate: '2026-03-10',
        period: ['2026-03-10', '2026-04-09'],
      });
      h.provider.simulatePayment(charge.providerChargeId!, 'PIX'); // the webhook is never drained

      const result = await run();
      await h.sweep.run({ correlationId: 'corr-sweep' });

      expect(result.drifted).toBe(1);
      expect(charge.status).toBe('PAID');
      expect(subscription.status).toBe('ACTIVE');
    });

    it('reaches a suspended tenant: the payment of its recovery charge reactivates it', async () => {
      const subscription = await tenant('SUSPENDED');
      const recovery = await h.seedCharge(subscription, {
        kind: 'RECOVERY',
        dueDate: '2026-03-15',
      });
      h.provider.simulatePayment(recovery.providerChargeId!, 'PIX');

      await run();

      expect(subscription.status).toBe('ACTIVE');
    });
  });

  describe('the full scope (once a day)', () => {
    const seedWorld = async (): Promise<{
      futureRenewal: Charge;
      recentlyPaid: Charge;
      oldPaid: Charge;
    }> => {
      const subscription = await tenant();
      const futureRenewal = await h.seedCharge(subscription, {
        dueDate: '2026-03-18',
        period: ['2026-03-18', '2026-04-17'],
      });
      const recentlyPaid = await h.seedCharge(subscription, {
        dueDate: '2026-02-18',
        period: ['2026-02-18', '2026-03-17'],
      });
      h.provider.simulatePayment(recentlyPaid.providerChargeId!, 'CARD');
      await h.sync.sync({
        tenantId: subscription.tenantId,
        chargeId: recentlyPaid.id,
        correlationId: 'seed',
      });
      const oldPaid = await h.seedCharge(subscription, {
        dueDate: '2025-12-18',
        period: ['2025-12-18', '2026-01-17'],
      });
      h.provider.simulatePayment(oldPaid.providerChargeId!, 'CARD');
      await h.sync.sync({
        tenantId: subscription.tenantId,
        chargeId: oldPaid.id,
        correlationId: 'seed',
      });
      return { futureRenewal, recentlyPaid, oldPaid };
    };

    it('runs when no complete full pass exists, reading every open charge and every charge paid in the last 35 days', async () => {
      const { futureRenewal, recentlyPaid, oldPaid } = await seedWorld();
      const spy = jest.spyOn(h.provider, 'fetchChargeStatus');

      const result = await run();

      const read = spy.mock.calls.map(([id]) => id);
      expect(result.scope).toBe('FULL');
      expect(read).toContain(futureRenewal.providerChargeId);
      expect(read).toContain(recentlyPaid.providerChargeId);
      expect(read).not.toContain(oldPaid.providerChargeId);
    });

    it('catches a refund of a recently paid charge that no webhook reported', async () => {
      const { recentlyPaid } = await seedWorld();
      h.provider.simulateRefund(recentlyPaid.providerChargeId!, 'FULL');

      await run();

      expect(recentlyPaid.status).toBe('REFUNDED');
    });

    it('stamps the full pass, so the next hourly run is the at-risk one again', async () => {
      await seedWorld();

      await run();
      const second = await run();

      expect((await healthRow())?.lastFullReconcileAt).toEqual(SWEEP_NOW);
      expect(second.scope).toBe('AT_RISK');
    });

    it('does not run before the configured hour even when the last full pass is old', async () => {
      await seedWorld();
      h.clock.setTo(new Date('2026-03-10T03:30:00Z'));

      expect((await run()).scope).toBe('AT_RISK');
    });

    it('runs on a redelivery after the hour when the last full pass is older than 24 hours', async () => {
      await seedWorld();
      const redelivery = new Date('2026-03-10T09:15:00Z');
      await h.health.save(
        new ProviderHealthBuilder()
          .withMerchantProfileKey(KEY)
          .withLastFullReconcileAt(new Date(redelivery.getTime() - 25 * HOUR_MS))
          .build(),
      );
      h.clock.setTo(redelivery);

      expect((await run()).scope).toBe('FULL');
    });
  });

  describe('when it advances last_reconcile_ok_at', () => {
    beforeEach(fullPassDone);

    it('a complete run in which the provider answered advances it for that account', async () => {
      await h.seedCharge(await tenant('PAST_DUE'), { dueDate: '2026-03-01' });

      const result = await run();

      expect((await healthRow())?.lastReconcileOkAt).toEqual(SWEEP_NOW);
      expect(result.advanced).toBe(1);
    });

    it('leaves a freeze, and the full-pass stamp of an at-risk run, as they were', async () => {
      const frozenSince = new Date(SWEEP_NOW.getTime() - 3 * HOUR_MS);
      await h.health.save(
        new ProviderHealthBuilder()
          .withMerchantProfileKey(KEY)
          .withFreeze(frozenSince)
          .withWebhookStatus('PAUSED')
          .withLastFullReconcileAt(new Date(SWEEP_NOW.getTime() - HOUR_MS))
          .build(),
      );
      await h.seedCharge(await tenant('PAST_DUE'), { dueDate: '2026-03-01' });

      await run();

      expect(await healthRow()).toMatchObject({
        freezeActive: true,
        freezeSince: frozenSince,
        webhookStatus: 'PAUSED',
        lastFullReconcileAt: new Date(SWEEP_NOW.getTime() - HOUR_MS),
        lastReconcileOkAt: SWEEP_NOW,
      });
    });

    it('nothing to check: it reads the account health and advances only if that succeeds', async () => {
      await tenant(); // one account in use, no charge at risk
      const health = jest.spyOn(h.provider, 'readAccountHealth');

      const result = await run();

      expect(health).toHaveBeenCalledTimes(1);
      expect(result.checked).toBe(0);
      expect((await healthRow())?.lastReconcileOkAt).toEqual(SWEEP_NOW);
    });

    it('nothing to check and the provider down: the run fails and last_reconcile_ok_at stays', async () => {
      await tenant();
      const before = (await healthRow())?.lastReconcileOkAt;
      h.provider.failNextCall('UNAVAILABLE');

      await expect(run()).rejects.toBeDefined();

      expect((await healthRow())?.lastReconcileOkAt).toEqual(before);
      expect(before).not.toEqual(SWEEP_NOW);
    });

    it('one charge failing never stops the others: every charge is tried, the run is logged, then it fails', async () => {
      const first = await h.seedCharge(await tenant('PAST_DUE'), { dueDate: '2026-03-01' });
      const second = await h.seedCharge(await tenant('PAST_DUE'), { dueDate: '2026-03-02' });
      h.provider.simulatePayment(second.providerChargeId!, 'PIX');
      h.provider.failNextCall('UNAVAILABLE'); // the first read of the run fails
      const logged = jest.spyOn(AppLogger.prototype, 'log');
      jest.spyOn(AppLogger.prototype, 'error').mockImplementation();

      await expect(run()).rejects.toBeDefined();

      expect(first.status).toBe('PENDING');
      expect(second.status).toBe('PAID');
      expect(logged).toHaveBeenCalledWith(
        'billing_reconcile_run',
        expect.objectContaining({ checked: 2, failed: 1, drifted: 1, truncated: false }),
      );
    });

    describe('a full pass that did not read everything is not stamped as done', () => {
      const staleFullPass = new Date(SWEEP_NOW.getTime() - 30 * HOUR_MS);
      const needsFullPass = () =>
        h.health.save(
          new ProviderHealthBuilder()
            .withMerchantProfileKey(KEY)
            .withLastFullReconcileAt(staleFullPass)
            .build(),
        );

      it('a charge whose read failed leaves last_full_reconcile_at alone, while the account that answered is still stamped', async () => {
        await needsFullPass();
        await h.seedCharge(await tenant('PAST_DUE'), { dueDate: '2026-03-01' });
        await h.seedCharge(await tenant('PAST_DUE'), { dueDate: '2026-03-02' });
        h.provider.failNextCall('UNAVAILABLE'); // the first read of the run fails
        jest.spyOn(AppLogger.prototype, 'error').mockImplementation();

        await expect(run()).rejects.toBeDefined();

        expect(await healthRow()).toMatchObject({
          lastFullReconcileAt: staleFullPass,
          lastReconcileOkAt: SWEEP_NOW,
        });
      });

      it('a selection page that could not be read leaves it alone too: the whole selection went unread', async () => {
        await needsFullPass();
        await h.seedCharge(await tenant('PAST_DUE'), { dueDate: '2026-03-01' });
        jest.spyOn(h.charges, 'listRecentlyPaidForJob').mockRejectedValue(new Error('timeout'));

        await expect(run()).rejects.toThrow('timeout');

        expect((await healthRow())?.lastFullReconcileAt).toEqual(staleFullPass);
      });

      it('the next run, which reads everything, stamps it', async () => {
        await needsFullPass();
        await h.seedCharge(await tenant('PAST_DUE'), { dueDate: '2026-03-01' });

        const result = await run();

        expect(result.scope).toBe('FULL');
        expect((await healthRow())?.lastFullReconcileAt).toEqual(SWEEP_NOW);
      });
    });

    it('a selection page that cannot be read is counted and the other selections still run', async () => {
      const charge = await h.seedCharge(await tenant('PAST_DUE'), { dueDate: '2026-03-01' });
      h.provider.simulatePayment(charge.providerChargeId!, 'PIX');
      jest.spyOn(h.charges, 'listOpenRecoveryForJob').mockRejectedValue(new Error('db'));
      const logged = jest.spyOn(AppLogger.prototype, 'log');

      await expect(run()).rejects.toThrow('db');

      expect(charge.status).toBe('PAID');
      expect(logged).toHaveBeenCalledWith(
        'billing_reconcile_run',
        expect.objectContaining({ selectionFailed: 1 }),
      );
    });
  });

  describe('the provider cancels still pending', () => {
    beforeEach(fullPassDone);

    const cancelledLocally = async (): Promise<Charge> => {
      const charge = await h.seedCharge(await tenant(), {
        dueDate: '2026-03-01',
        period: ['2026-02-01', '2026-02-28'],
      });
      charge.cancel();
      charge.markProviderCancelPending();
      return charge;
    };

    it('cancels the charge at the provider and clears the flag', async () => {
      const charge = await cancelledLocally();

      const result = await run();

      expect(charge.providerCancelPending).toBe(false);
      expect(result.cancelRetries).toBe(1);
    });

    it('a provider that says it was already paid makes that charge the payment, through the shared apply', async () => {
      const charge = await cancelledLocally();
      h.provider.simulatePayment(charge.providerChargeId!, 'PIX');
      const apply = jest.spyOn(h.applyFact, 'execute');

      await run();

      expect(apply).toHaveBeenCalledTimes(1);
      expect(charge.providerCancelPending).toBe(false);
    });

    it('a cancel that fails again stays pending for the next run', async () => {
      const charge = await cancelledLocally();
      h.provider.failNextCall('UNAVAILABLE');

      await run();

      expect(charge.providerCancelPending).toBe(true);
    });
  });

  describe('a provider account no adapter serves yet (a staging sandbox key before M26-S37)', () => {
    beforeEach(fullPassDone);

    it('is skipped and logged at warn, the served account is still reconciled, and the run does not fail', async () => {
      const warn = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
      const error = jest.spyOn(AppLogger.prototype, 'error').mockImplementation();
      await tenant('ACTIVE', (b) => b.withMerchantProfileKey('BRL_ASAAS_SANDBOX'));
      await h.seedCharge(await tenant('PAST_DUE'), { dueDate: '2026-03-01' });

      const result = await run();

      expect(result.checked).toBe(1);
      expect(result.advanced).toBe(1);
      expect((await healthRow())?.lastReconcileOkAt).toEqual(SWEEP_NOW);
      expect(await h.health.findByKey('BRL_ASAAS_SANDBOX')).toBeNull();
      expect(warn).toHaveBeenCalledWith('billing_provider_not_supported: skipped', {
        merchantProfileKey: 'BRL_ASAAS_SANDBOX',
      });
      expect(error).not.toHaveBeenCalled();
    });

    it('a run whose only account has no adapter succeeds and advances nothing', async () => {
      jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
      await tenant('ACTIVE', (b) => b.withMerchantProfileKey('BRL_ASAAS_SANDBOX'));
      const health = jest.spyOn(h.provider, 'readAccountHealth');

      const result = await run();

      expect(result).toMatchObject({ checked: 0, advanced: 0, failed: 0 });
      expect(health).not.toHaveBeenCalled();
    });
  });
});
