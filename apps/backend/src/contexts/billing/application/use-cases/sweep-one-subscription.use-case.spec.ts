import { AppLogger } from '../../../../shared/observability/app-logger';
import { SubscriptionBuilder } from '../../../../test/builders/billing';
import {
  createSweepHarness,
  SWEEP_NOW,
} from '../../../../test/infrastructure/billing-sweep-harness';
import type { Charge } from '../../domain/charge.aggregate';
import type { Subscription } from '../../domain/subscription.aggregate';

// São Paulo is UTC-3 with no DST: NOW is 12:00 local on 2026-03-10.
const DAY_MS = 24 * 60 * 60 * 1000;
const at = (iso: string): Date => new Date(iso);
const ago = (days: number): Date => new Date(SWEEP_NOW.getTime() - days * DAY_MS);
// The trial closed at the start of 2026-03-09 local: 36 hours before NOW, past the 24 h margin.
const TRIAL_ENDED = at('2026-03-09T03:00:00Z');

describe('SweepOneSubscriptionUseCase (UC-115)', () => {
  let h: ReturnType<typeof createSweepHarness>;
  const frozen = new Set<string>();

  beforeEach(() => {
    h = createSweepHarness();
  });

  const sweep = (subscription: Subscription, frozenProfileKeys: ReadonlySet<string> = frozen) =>
    h.sweepOne.execute({
      tenantId: subscription.tenantId,
      correlationId: 'corr-sweep',
      frozenProfileKeys,
    });
  const unpaidTrial = async (options: { ready?: boolean } = {}) => {
    const subscription = new SubscriptionBuilder()
      .withStatus('TRIALING')
      .withTrialEndsAt(TRIAL_ENDED)
      .withItems([h.hotsiteItem()])
      .build();
    await h.seedTenant(subscription);
    // The trial's invoice covers the month from the day the trial ends.
    const first = await h.seedCharge(subscription, {
      dueDate: '2026-03-09',
      period: ['2026-03-09', '2026-04-08'],
      ...options,
    });
    return { subscription, first };
  };
  const pastDue = async (options: { billable?: boolean } = {}) => {
    const subscription = new SubscriptionBuilder()
      .withStatus('PAST_DUE')
      .withPastDueSince(ago(15))
      .withItems([h.hotsiteItem()])
      .build();
    await h.seedTenant(subscription, options);
    const stale = await h.seedCharge(subscription, { dueDate: '2026-02-20', status: 'OVERDUE' });
    return { subscription, stale };
  };
  const recoveryOf = (subscription: Subscription): Charge | undefined =>
    h.charges.saved.find((c) => c.subscriptionId === subscription.id && c.kind === 'RECOVERY');

  it('answers NOT_FOUND for a tenant with no subscription', async () => {
    const result = await h.sweepOne.execute({
      tenantId: 'no-such-tenant',
      correlationId: 'corr-sweep',
      frozenProfileKeys: frozen,
    });

    expect(result).toEqual({ outcome: 'NOT_FOUND', steps: [], deferred: false });
  });

  it('never touches an exempt subscription, whatever it holds', async () => {
    const subscription = new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withExempt(true)
      .withCancelAt(ago(1))
      .withItems([h.hotsiteItem()])
      .build();
    await h.seedTenant(subscription);

    const result = await sweep(subscription);

    expect(result.outcome).toBe('EXEMPT');
    expect(subscription.status).toBe('ACTIVE');
    expect(h.outbox.published).toEqual([]);
  });

  it('sweeping one tenant never touches another tenant that is also due', async () => {
    const other = await pastDue();
    const swept = await pastDue();
    h.outbox.published.length = 0;

    await sweep(swept.subscription);

    expect(swept.subscription.status).toBe('SUSPENDED');
    expect(other.subscription.status).toBe('PAST_DUE');
    expect(other.stale.status).toBe('OVERDUE');
    expect(recoveryOf(other.subscription)).toBeUndefined();
    expect(h.outbox.published.every((e) => e.tenantId === swept.subscription.tenantId)).toBe(true);
  });

  it('decides exemption on the locked row: a stale snapshot that says "not exempt" does not get a tenant suspended', async () => {
    const subscription = new SubscriptionBuilder()
      .withStatus('PAST_DUE')
      .withPastDueSince(ago(30))
      .withExempt(true)
      .withItems([h.hotsiteItem()])
      .build();
    await h.seedTenant(subscription);
    // The cached read an earlier request left behind: the same tenant, before it became exempt.
    const stale = new SubscriptionBuilder()
      .withTenantId(subscription.tenantId)
      .withStatus('PAST_DUE')
      .withPastDueSince(ago(30))
      .withItems([h.hotsiteItem()])
      .build();
    jest.spyOn(h.subscriptions, 'findByTenantId').mockResolvedValueOnce(stale);

    const result = await sweep(subscription);

    expect(result).toEqual({ outcome: 'EXEMPT', steps: [], deferred: false });
    expect(subscription.status).toBe('PAST_DUE');
    expect(recoveryOf(subscription)).toBeUndefined();
  });

  describe('the trial-end re-read (a missed webhook never locks out a paying tenant)', () => {
    it('applies a payment the webhook missed and activates the trial instead of suspending it', async () => {
      const { subscription, first } = await unpaidTrial();
      h.provider.simulatePayment(first.providerChargeId!, 'PIX');

      const result = await sweep(subscription);

      expect(first.status).toBe('PAID');
      expect(subscription.status).toBe('ACTIVE');
      expect(subscription.currentPeriodStart).toEqual(TRIAL_ENDED);
      expect(result.steps).toEqual(['TRIAL_ACTIVATED']);
      expect(recoveryOf(subscription)).toBeUndefined();
    });

    it('suspends when the provider confirms the first charge is unpaid', async () => {
      const { subscription } = await unpaidTrial();

      const result = await sweep(subscription);

      expect(subscription.status).toBe('SUSPENDED');
      expect(subscription.suspensionReason).toBe('NON_PAYMENT');
      expect(result.steps).toEqual(expect.arrayContaining(['TRIAL_SUSPENDED']));
    });

    it('never trusts an "unpaid" answer that does not describe the charge: the suspension waits', async () => {
      const { subscription } = await unpaidTrial();
      const real = h.provider.fetchChargeStatus.bind(h.provider);
      // The provider's charge is for another amount than ours: it cannot be the same invoice.
      jest
        .spyOn(h.provider, 'fetchChargeStatus')
        .mockImplementation(async (id) => ({ ...(await real(id)), amountMinor: 1 }));

      const result = await sweep(subscription);

      expect(result.deferred).toBe(true);
      expect(subscription.status).toBe('TRIALING');
      expect(recoveryOf(subscription)).toBeUndefined();
    });

    it('leaves the trial alone when the provider cannot be asked, and suspends on the next run', async () => {
      const { subscription } = await unpaidTrial();
      h.provider.failNextCall('UNAVAILABLE');

      const first = await sweep(subscription);

      expect(first.deferred).toBe(true);
      expect(subscription.status).toBe('TRIALING');
      expect(recoveryOf(subscription)).toBeUndefined();

      const second = await sweep(subscription);

      expect(second.deferred).toBe(false);
      expect(subscription.status).toBe('SUSPENDED');
    });

    it('does not even ask the provider while its suspension freeze is on', async () => {
      const { subscription } = await unpaidTrial();
      const asked = jest.spyOn(h.provider, 'fetchChargeStatus');

      const result = await sweep(subscription, new Set(['BRL_FAKE']));

      expect(asked).not.toHaveBeenCalled();
      expect(subscription.status).toBe('TRIALING');
      expect(result.deferred).toBe(false);
    });
  });

  describe('a non-payment suspension', () => {
    it('makes the recovery charge payable within the same run, cancels the stale charge at the provider and clears its flag', async () => {
      const { subscription, stale } = await pastDue();

      const result = await sweep(subscription);

      expect(result.outcome).toBe('SWEPT');
      expect(subscription.suspensionReason).toBe('NON_PAYMENT');
      const recovery = recoveryOf(subscription)!;
      expect(recovery).toMatchObject({ status: 'PENDING', providerCreationStatus: 'READY' });
      expect(recovery.paymentUrl).toEqual(expect.any(String));
      expect(stale.status).toBe('CANCELED');
      expect(stale.providerCancelPending).toBe(false);
      expect(h.provider.charges.get(stale.providerChargeId!)?.state).toBe('CANCELED');
    });

    it('a provider cancel that fails leaves the suspension in place and the charge flagged for reconcile', async () => {
      const { subscription, stale } = await pastDue();
      // The first provider call of a grace suspension is the stale charge's cancel.
      h.provider.failNextCall('UNAVAILABLE');

      await sweep(subscription);

      expect(subscription.status).toBe('SUSPENDED');
      expect(stale.status).toBe('CANCELED');
      expect(stale.providerCancelPending).toBe(true);
      expect(recoveryOf(subscription)?.providerCreationStatus).toBe('READY');
    });

    it('a refused cancel on a charge that was just paid makes that charge the payment: reactivated, no recovery charge', async () => {
      const { subscription, stale } = await pastDue();
      h.provider.simulatePayment(stale.providerChargeId!, 'PIX');

      await sweep(subscription);

      expect(stale.status).toBe('PAID');
      expect(subscription.status).toBe('ACTIVE');
      expect(recoveryOf(subscription)?.status).toBe('CANCELED');
      expect(recoveryOf(subscription)?.providerChargeId).toBeNull();
    });

    it('a tenant with no billing address is suspended and its recovery charge held PENDING, with no provider call', async () => {
      const { subscription } = await pastDue({ billable: false });
      const created = jest.spyOn(h.provider, 'createCharge');

      await sweep(subscription);

      expect(subscription.status).toBe('SUSPENDED');
      expect(recoveryOf(subscription)).toMatchObject({
        status: 'PENDING',
        providerCreationStatus: 'PENDING',
        providerChargeId: null,
      });
      expect(created).not.toHaveBeenCalled();
    });

    it('a failing recovery creation never undoes the suspension: the charge stays PENDING for the retry', async () => {
      const { subscription } = await pastDue();
      jest.spyOn(h.creation, 'execute').mockRejectedValue(new Error('database down'));

      await sweep(subscription);

      expect(subscription.status).toBe('SUSPENDED');
      expect(recoveryOf(subscription)).toMatchObject({ providerCreationStatus: 'PENDING' });
    });

    it('runs the sweep a second time and changes nothing', async () => {
      const { subscription } = await pastDue();
      await sweep(subscription);
      h.outbox.published.length = 0;

      const second = await sweep(subscription);

      expect(second).toMatchObject({ outcome: 'UNCHANGED', steps: [] });
      expect(h.outbox.published).toEqual([]);
      expect(h.charges.saved.filter((c) => c.kind === 'RECOVERY')).toHaveLength(1);
    });

    it('a profile other than the frozen one is not frozen', async () => {
      const { subscription } = await pastDue();

      await sweep(subscription, new Set(['USD_FAKE']));

      expect(subscription.status).toBe('SUSPENDED');
    });

    it('a frozen profile keeps the subscription PAST_DUE, charge untouched', async () => {
      const { subscription, stale } = await pastDue();

      const result = await sweep(subscription, new Set(['BRL_FAKE']));

      expect(subscription.status).toBe('PAST_DUE');
      expect(stale.status).toBe('OVERDUE');
      expect(result.steps).toEqual([]);
    });
  });

  it('never calls the provider inside a transaction', async () => {
    const { subscription } = await pastDue();
    const calls: Array<{ method: string; inTransaction: boolean }> = [];
    for (const method of [
      'ensureCustomer',
      'createCharge',
      'cancelCharge',
      'fetchChargeStatus',
    ] as const) {
      const original = h.provider[method].bind(h.provider) as (...args: unknown[]) => unknown;
      jest.spyOn(h.provider, method).mockImplementation(((...args: unknown[]) => {
        calls.push({ method, inTransaction: h.txManager.isInTransaction });
        return original(...args);
      }) as never);
    }
    const trial = await unpaidTrial();

    await sweep(subscription);
    await sweep(trial.subscription);

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((call) => !call.inTransaction)).toBe(true);
    expect(calls.map((call) => call.method)).toEqual(
      expect.arrayContaining(['cancelCharge', 'createCharge', 'fetchChargeStatus']),
    );
  });

  it('a cancel-at suspension never issues a recovery charge', async () => {
    const subscription = new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withCancelAt(ago(1))
      .withItems([h.hotsiteItem()])
      .build();
    await h.seedTenant(subscription);

    const result = await sweep(subscription);

    expect(result.steps).toEqual(['CANCELED']);
    expect(subscription.suspensionReason).toBe('CANCELED');
    expect(recoveryOf(subscription)).toBeUndefined();
  });

  describe('a key no adapter serves yet', () => {
    it('defers the trial-end re-read like an unreachable provider, logged at warn and not as a failed re-read', async () => {
      const warn = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
      const error = jest.spyOn(AppLogger.prototype, 'error').mockImplementation();
      const subscription = new SubscriptionBuilder()
        .withStatus('TRIALING')
        .withTrialEndsAt(TRIAL_ENDED)
        .withMerchantProfileKey('BRL_ASAAS_SANDBOX')
        .withItems([h.hotsiteItem()])
        .build();
      await h.seedTenant(subscription);
      const first = await h.seedCharge(subscription, {
        dueDate: '2026-03-09',
        period: ['2026-03-09', '2026-04-08'],
      });
      const fetch = jest.spyOn(h.provider, 'fetchChargeStatus');

      const result = await sweep(subscription);

      expect(result.deferred).toBe(true);
      expect(subscription.status).toBe('TRIALING');
      expect(fetch).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('billing_provider_not_supported: skipped', {
        tenantId: subscription.tenantId,
        chargeId: first.id,
        merchantProfileKey: 'BRL_ASAAS_SANDBOX',
      });
      expect(warn).not.toHaveBeenCalledWith(
        expect.stringContaining('billing_sweep_provider_reread_failed'),
        expect.anything(),
      );
      expect(error).not.toHaveBeenCalled();
    });
  });
});
