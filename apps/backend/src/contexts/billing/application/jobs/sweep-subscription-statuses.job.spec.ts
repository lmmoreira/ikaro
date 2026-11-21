import { AppLogger } from '../../../../shared/observability/app-logger';
import { ProviderHealthBuilder, SubscriptionBuilder } from '../../../../test/builders/billing';
import {
  createSweepHarness,
  SWEEP_NOW,
} from '../../../../test/infrastructure/billing-sweep-harness';
import { BILLING_JOB_PAGE_SIZE } from '../../domain/billing-constants';
import type { Subscription } from '../../domain/subscription.aggregate';

// São Paulo is UTC-3 with no DST: NOW is 12:00 local on 2026-03-10.
const DAY_MS = 24 * 60 * 60 * 1000;
const ago = (days: number): Date => new Date(SWEEP_NOW.getTime() - days * DAY_MS);

describe('SweepSubscriptionStatusesJob (UC-115)', () => {
  let h: ReturnType<typeof createSweepHarness>;

  beforeEach(() => {
    h = createSweepHarness();
  });

  const run = () => h.sweep.run({ correlationId: 'corr-run' });
  const pastDue = async (): Promise<Subscription> => {
    const subscription = new SubscriptionBuilder()
      .withStatus('PAST_DUE')
      .withPastDueSince(ago(15))
      .withItems([h.hotsiteItem()])
      .build();
    await h.seedTenant(subscription);
    return subscription;
  };
  const activeWithOverdueCharge = async (dueDate: string): Promise<Subscription> => {
    const subscription = new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withItems([h.hotsiteItem()])
      .build();
    await h.seedTenant(subscription);
    await h.seedCharge(subscription, { dueDate });
    return subscription;
  };

  it('sweeps what each of the four selections finds, and nothing else', async () => {
    const overdue = await activeWithOverdueCharge('2026-03-09');
    const grace = await pastDue();
    const cancelling = new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withCancelAt(ago(1))
      .withItems([h.hotsiteItem()])
      .build();
    const trial = new SubscriptionBuilder()
      .withStatus('TRIALING')
      .withTrialEndsAt(new Date('2026-03-09T03:00:00Z'))
      .withItems([h.hotsiteItem()])
      .build();
    const healthy = new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withItems([h.hotsiteItem()])
      .build();
    for (const subscription of [cancelling, trial, healthy]) await h.seedTenant(subscription);

    const result = await run();

    expect(result.selected).toBe(4);
    expect(overdue.status).toBe('PAST_DUE');
    expect(grace.status).toBe('SUSPENDED');
    expect(cancelling.suspensionReason).toBe('CANCELED');
    expect(trial.suspensionReason).toBe('NON_PAYMENT');
    expect(healthy.status).toBe('ACTIVE');
    expect(result.steps).toMatchObject({
      OVERDUE: 1,
      PAST_DUE: 1,
      GRACE_SUSPENDED: 1,
      CANCELED: 1,
      TRIAL_SUSPENDED: 1,
    });
  });

  it('sweeps a subscription two selections both return only once', async () => {
    // Past its grace and past its cancelAt: the grace selection and the cancel selection both match it.
    const both = new SubscriptionBuilder()
      .withStatus('PAST_DUE')
      .withPastDueSince(ago(15))
      .withCancelAt(ago(1))
      .withItems([h.hotsiteItem()])
      .build();
    await h.seedTenant(both);

    const result = await run();

    expect(result.selected).toBe(1);
    expect(both.suspensionReason).toBe('CANCELED');
  });

  it('running twice changes nothing the second time', async () => {
    await pastDue();
    await run();
    h.outbox.published.length = 0;

    const second = await run();

    expect(second.steps).toEqual({});
    expect(h.outbox.published).toEqual([]);
  });

  it('never selects an exempt subscription', async () => {
    const exempt = new SubscriptionBuilder()
      .withStatus('PAST_DUE')
      .withPastDueSince(ago(30))
      .withExempt(true)
      .withItems([h.hotsiteItem()])
      .build();
    await h.seedTenant(exempt);

    const result = await run();

    expect(result.selected).toBe(0);
    expect(exempt.status).toBe('PAST_DUE');
  });

  describe('the suspension freeze', () => {
    it('is read once for the run, and holds back only the subscriptions of the frozen profile', async () => {
      await h.health.save(new ProviderHealthBuilder().withFreeze(ago(1)).build());
      const frozen = await pastDue();
      const reads = jest.spyOn(h.health, 'listFrozenKeys');

      const result = await run();

      expect(reads).toHaveBeenCalledTimes(1);
      expect(frozen.status).toBe('PAST_DUE');
      expect(result.steps).toEqual({});
    });

    it('a row for another profile freezes nobody here, and no row at all means not frozen', async () => {
      await h.health.save(
        new ProviderHealthBuilder().withMerchantProfileKey('USD_FAKE').withFreeze(ago(1)).build(),
      );
      const subscription = await pastDue();

      await run();

      expect(subscription.status).toBe('SUSPENDED');
    });

    it('a freeze that cannot be read fails the run before anything is suspended', async () => {
      const subscription = await pastDue();
      jest.spyOn(h.health, 'listFrozenKeys').mockRejectedValue(new Error('database down'));

      await expect(run()).rejects.toThrow('database down');

      expect(subscription.status).toBe('PAST_DUE');
    });
  });

  it('shares one price lookup between every suspension of the run', async () => {
    await pastDue();
    await pastDue();
    await pastDue();
    const lookups = jest.spyOn(h.prices, 'findByNaturalKey');

    await run();

    expect(lookups).toHaveBeenCalledTimes(1);
  });

  describe('failure isolation and paging', () => {
    it('one subscription that fails does not stop the others, and the run fails once at the end', async () => {
      const broken = await pastDue();
      const healthy = await pastDue();
      const original = h.subscriptions.findByTenantIdForUpdate.bind(h.subscriptions);
      jest.spyOn(h.subscriptions, 'findByTenantIdForUpdate').mockImplementation((tenantId) => {
        if (tenantId === broken.tenantId) throw new Error('lock failed');
        return original(tenantId);
      });

      await expect(run()).rejects.toThrow('1 subscriptions failed to sweep');

      expect(healthy.status).toBe('SUSPENDED');
      expect(broken.status).toBe('PAST_DUE');
    });

    it('the run line counts every subscription visited, the failed ones included, and every failed subscription once', async () => {
      const brokenA = await pastDue();
      const brokenB = await pastDue();
      await pastDue();
      const original = h.subscriptions.findByTenantIdForUpdate.bind(h.subscriptions);
      jest.spyOn(h.subscriptions, 'findByTenantIdForUpdate').mockImplementation((tenantId) => {
        if (tenantId === brokenA.tenantId || tenantId === brokenB.tenantId) {
          throw new Error('lock failed');
        }
        return original(tenantId);
      });
      const logged = jest.spyOn(AppLogger.prototype, 'log');

      await expect(run()).rejects.toThrow('2 subscriptions failed to sweep');

      const [, context] = logged.mock.calls.find(
        ([message]) => message === 'billing_status_sweep_run',
      )!;
      // Two failures in one page are two failed subscriptions (not one failed page), and the
      // failing tenants were visited like the healthy one.
      expect(context).toMatchObject({ selected: 3, failed: 2, selectionFailed: 0 });
    });

    it('pages through every candidate, not just the first page', async () => {
      const subscriptions = await Promise.all(
        Array.from({ length: BILLING_JOB_PAGE_SIZE + 1 }, async () => {
          const subscription = new SubscriptionBuilder()
            .withStatus('ACTIVE')
            .withCancelAt(ago(1))
            .withItems([h.hotsiteItem()])
            .build();
          await h.subscriptions.save(subscription);
          return subscription;
        }),
      );

      const result = await run();

      expect(result.selected).toBe(BILLING_JOB_PAGE_SIZE + 1);
      expect(subscriptions.every((s) => s.status === 'SUSPENDED')).toBe(true);
    });

    it('a page of subscriptions that stay selected (a frozen profile) never starves one behind them', async () => {
      // The frozen trials sort first and are never changed, so they are selected again and again:
      // with a head-only selection the unfrozen one behind them would never be reached.
      await h.health.save(new ProviderHealthBuilder().withFreeze(ago(1)).build());
      for (let i = 0; i < BILLING_JOB_PAGE_SIZE; i++) {
        const stuck = new SubscriptionBuilder()
          .withStatus('TRIALING')
          .withTrialEndsAt(new Date(ago(2).getTime() + i))
          .withItems([h.hotsiteItem()])
          .build();
        await h.subscriptions.save(stuck);
      }
      const behind = new SubscriptionBuilder()
        .withStatus('TRIALING')
        .withMerchantProfileKey('USD_FAKE')
        .withTrialEndsAt(new Date('2026-03-09T03:00:00Z'))
        .withItems([h.hotsiteItem()])
        .build();
      await h.seedTenant(behind);

      const result = await run();

      expect(result.selected).toBe(BILLING_JOB_PAGE_SIZE + 1);
      expect(behind.suspensionReason).toBe('NON_PAYMENT');
    });
  });
});
