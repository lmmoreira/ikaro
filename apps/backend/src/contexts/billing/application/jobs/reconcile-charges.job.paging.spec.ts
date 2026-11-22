import { AppLogger } from '../../../../shared/observability/app-logger';
import { ProviderHealthBuilder, SubscriptionBuilder } from '../../../../test/builders/billing';
import {
  createReconcileHarness,
  SWEEP_NOW,
} from '../../../../test/infrastructure/billing-reconcile-harness';
import { RECONCILE_RUN_BUDGET_MS } from '../../domain/billing-constants';
import type { Charge } from '../../domain/charge.aggregate';

// A page of 2 and a run limit of 5, so paging and truncation are reachable with a handful of rows.
jest.mock('../../domain/billing-constants', () => ({
  ...jest.requireActual('../../domain/billing-constants'),
  BILLING_JOB_PAGE_SIZE: 2,
  RECONCILE_RUN_LIMIT: 5,
  RECONCILE_CONCURRENCY: 2,
}));

const KEY = 'BRL_FAKE';
const HOUR_MS = 60 * 60 * 1000;

describe('ReconcileChargesJob paging and the run limit (UC-116)', () => {
  let h: ReturnType<typeof createReconcileHarness>;
  let lastOkBefore: Date | null | undefined;

  beforeEach(async () => {
    h = createReconcileHarness();
    jest.restoreAllMocks();
    // A complete full pass an hour ago: the run is the at-risk one.
    await h.health.save(
      new ProviderHealthBuilder()
        .withMerchantProfileKey(KEY)
        .withLastFullReconcileAt(new Date(SWEEP_NOW.getTime() - HOUR_MS))
        .build(),
    );
    lastOkBefore = (await h.health.findByKey(KEY))?.lastReconcileOkAt;
  });

  // One overdue charge per tenant, due on a distinct earlier day: the first selection's order.
  const overdueCharges = async (count: number): Promise<Charge[]> => {
    const charges: Charge[] = [];
    for (let day = 1; day <= count; day += 1) {
      const subscription = new SubscriptionBuilder()
        .withStatus('PAST_DUE')
        .withItems([h.hotsiteItem()])
        .build();
      await h.seedTenant(subscription);
      charges.push(await h.seedCharge(subscription, { dueDate: `2026-03-0${day}` }));
    }
    return charges;
  };
  const run = () => h.reconcile.run({ correlationId: 'corr-paging' });

  it('pages a selection by keyset: every row is read once, across pages, in due-date order', async () => {
    const charges = await overdueCharges(5);
    const spy = jest.spyOn(h.provider, 'fetchChargeStatus');

    const result = await run();

    expect(spy.mock.calls.map(([id]) => id)).toEqual(charges.map((c) => c.providerChargeId));
    expect(result).toMatchObject({ checked: 5, truncated: false, advanced: 1 });
    expect((await h.health.findByKey(KEY))?.lastReconcileOkAt).toEqual(SWEEP_NOW);
  });

  it('a run that reaches the limit with rows left is truncated, advances nothing and says so', async () => {
    const charges = await overdueCharges(6);
    const spy = jest.spyOn(h.provider, 'fetchChargeStatus');
    const logged = jest.spyOn(AppLogger.prototype, 'log');

    const result = await run();

    expect(result).toMatchObject({ checked: 5, truncated: true, advanced: 0 });
    expect(spy.mock.calls.map(([id]) => id)).not.toContain(charges[5].providerChargeId);
    expect((await h.health.findByKey(KEY))?.lastReconcileOkAt).toEqual(lastOkBefore);
    expect(logged).toHaveBeenCalledWith(
      'billing_reconcile_run',
      expect.objectContaining({ truncated: true }),
    );
  });

  it('a run that outlasts its time budget starts no further read, is truncated and advances nothing', async () => {
    const charges = await overdueCharges(5);
    const original = h.provider.fetchChargeStatus.bind(h.provider);
    // A slow provider: the first read takes the run past its budget.
    const spy = jest.spyOn(h.provider, 'fetchChargeStatus').mockImplementation(async (id) => {
      h.clock.setTo(new Date(SWEEP_NOW.getTime() + RECONCILE_RUN_BUDGET_MS));
      return original(id);
    });

    const result = await run();

    expect(result).toMatchObject({ checked: 2, truncated: true, advanced: 0 });
    expect(spy.mock.calls.map(([id]) => id)).toEqual(
      charges.slice(0, 2).map((c) => c.providerChargeId),
    );
    expect((await h.health.findByKey(KEY))?.lastReconcileOkAt).toEqual(lastOkBefore);
  });

  it('there is no cursor between runs: the next run selects again from the start, oldest first', async () => {
    const charges = await overdueCharges(6);
    await run();
    const spy = jest.spyOn(h.provider, 'fetchChargeStatus');

    await run();

    expect(spy.mock.calls.map(([id]) => id)).toEqual(
      charges.slice(0, 5).map((c) => c.providerChargeId),
    );
  });

  it('settling what a truncated run read lets the next run reach the rest', async () => {
    const charges = await overdueCharges(6);
    for (const charge of charges.slice(0, 5))
      h.provider.simulatePayment(charge.providerChargeId!, 'PIX');
    await run();
    const spy = jest.spyOn(h.provider, 'fetchChargeStatus');

    const second = await run();

    expect(spy.mock.calls.map(([id]) => id)).toEqual([charges[5].providerChargeId]);
    expect(second.truncated).toBe(false);
  });

  it('the pending provider cancels run before the reads, so a truncated read pass never starves them', async () => {
    const subscription = new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withItems([h.hotsiteItem()])
      .build();
    await h.seedTenant(subscription);
    const cancelled = await h.seedCharge(subscription, {
      dueDate: '2026-02-01',
      period: ['2026-01-01', '2026-01-31'],
    });
    cancelled.cancel();
    cancelled.markProviderCancelPending();
    await overdueCharges(6);

    const result = await run();

    expect(result.truncated).toBe(true);
    expect(cancelled.providerCancelPending).toBe(false);
  });

  it('a truncated full pass leaves last_full_reconcile_at alone, so the next hour tries it again', async () => {
    await overdueCharges(6);
    const stale = new Date(SWEEP_NOW.getTime() - 30 * HOUR_MS);
    await h.health.save(
      new ProviderHealthBuilder()
        .withMerchantProfileKey(KEY)
        .withLastFullReconcileAt(stale)
        .build(),
    );

    const result = await run();

    expect(result).toMatchObject({ scope: 'FULL', truncated: true });
    expect((await h.health.findByKey(KEY))?.lastFullReconcileAt).toEqual(stale);
  });
});
