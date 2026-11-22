import { AppLogger } from '../../../../shared/observability/app-logger';
import { SubscriptionBuilder } from '../../../../test/builders/billing';
import { createSweepHarness } from '../../../../test/infrastructure/billing-sweep-harness';
import type { Charge } from '../../domain/charge.aggregate';
import type { Subscription } from '../../domain/subscription.aggregate';

describe('ProviderChargeCancellationService', () => {
  let h: ReturnType<typeof createSweepHarness>;
  let subscription: Subscription;

  beforeEach(async () => {
    h = createSweepHarness();
    subscription = new SubscriptionBuilder()
      .withSuspension('NON_PAYMENT', new Date('2026-03-09T12:00:00Z'))
      .withItems([h.hotsiteItem()])
      .build();
    await h.seedTenant(subscription);
  });

  const execute = (chargeIds: string[]) =>
    h.cancellation.execute({
      tenantId: subscription.tenantId,
      chargeIds,
      correlationId: 'corr-cancel',
    });
  // The caller's half: cancelled locally and flagged, as the sweep's transaction does it.
  const cancelledLocally = async (
    options: { ready?: boolean; period?: [string, string] } = {},
  ): Promise<Charge> => {
    const charge = await h.seedCharge(subscription, { dueDate: '2026-03-01', ...options });
    charge.cancel();
    if (charge.providerChargeId !== null) charge.markProviderCancelPending();
    return charge;
  };

  it('cancels the charge at the provider and clears its flag', async () => {
    const charge = await cancelledLocally();

    const result = await execute([charge.id]);

    expect(result).toEqual({ cancelled: 1, paid: 0, leftFlagged: 0, skipped: 0 });
    expect(h.provider.charges.get(charge.providerChargeId!)?.state).toBe('CANCELED');
    expect(charge.providerCancelPending).toBe(false);
  });

  it('a provider that fails leaves the flag for reconcile and never throws', async () => {
    const charge = await cancelledLocally();
    h.provider.failNextCall('UNAVAILABLE');

    const result = await execute([charge.id]);

    expect(result).toMatchObject({ cancelled: 0, leftFlagged: 1 });
    expect(charge.providerCancelPending).toBe(true);
  });

  it('one charge’s failure does not stop the next', async () => {
    const first = await cancelledLocally();
    const second = await cancelledLocally();
    h.provider.failNextCall('UNAVAILABLE');

    const result = await execute([first.id, second.id]);

    expect(result).toMatchObject({ cancelled: 1, leftFlagged: 1 });
    expect(first.providerCancelPending).toBe(true);
    expect(second.providerCancelPending).toBe(false);
  });

  it('a refusal because the charge was just paid makes it the payment, applied through the shared service', async () => {
    const charge = await cancelledLocally();
    h.provider.simulatePayment(charge.providerChargeId!, 'PIX');

    const result = await execute([charge.id]);

    expect(result).toMatchObject({ paid: 1, cancelled: 0 });
    expect(charge.status).toBe('PAID');
    expect(subscription.status).toBe('ACTIVE');
    expect(charge.providerCancelPending).toBe(false);
  });

  it('a charge that is not flagged, or that the provider never knew, is skipped', async () => {
    const unflagged = await h.seedCharge(subscription, { dueDate: '2026-03-01' });
    const unknown = await cancelledLocally({ ready: false, period: ['2026-01-10', '2026-02-09'] });

    const result = await execute([unflagged.id, unknown.id, 'no-such-charge']);

    expect(result).toEqual({ cancelled: 0, paid: 0, leftFlagged: 0, skipped: 3 });
  });

  it('a tenant with no subscription skips everything', async () => {
    const result = await h.cancellation.execute({
      tenantId: 'no-such-tenant',
      chargeIds: ['a', 'b'],
      correlationId: 'corr-cancel',
    });

    expect(result).toMatchObject({ skipped: 2 });
  });

  describe('a key no adapter serves yet', () => {
    it('leaves the charge flagged, counts it skipped, logs at warn and never throws', async () => {
      const warn = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
      const error = jest.spyOn(AppLogger.prototype, 'error').mockImplementation();
      const other = new SubscriptionBuilder()
        .withMerchantProfileKey('BRL_ASAAS_SANDBOX')
        .withItems([h.hotsiteItem()])
        .build();
      await h.seedTenant(other);
      const charge = await h.seedCharge(other, { dueDate: '2026-03-01' });
      charge.cancel();
      charge.markProviderCancelPending();
      const cancel = jest.spyOn(h.provider, 'cancelCharge');

      const result = await h.cancellation.execute({
        tenantId: other.tenantId,
        chargeIds: [charge.id],
        correlationId: 'corr-cancel',
      });

      expect(result).toEqual({ cancelled: 0, paid: 0, leftFlagged: 0, skipped: 1 });
      expect(charge.providerCancelPending).toBe(true);
      expect(cancel).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('billing_provider_not_supported: skipped', {
        tenantId: other.tenantId,
        chargeId: charge.id,
        merchantProfileKey: 'BRL_ASAAS_SANDBOX',
      });
      expect(error).not.toHaveBeenCalled();
    });
  });
});
