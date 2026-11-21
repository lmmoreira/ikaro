import { SubscriptionBuilder } from '../../../../test/builders/billing';
import { createReconcileHarness } from '../../../../test/infrastructure/billing-reconcile-harness';
import type { Charge } from '../../domain/charge.aggregate';

describe('RefreshChargeFromProviderUseCase (UC-116, the on-demand path of UC-119)', () => {
  let h: ReturnType<typeof createReconcileHarness>;
  let charge: Charge;

  beforeEach(async () => {
    h = createReconcileHarness();
    const subscription = new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withItems([h.hotsiteItem()])
      .build();
    await h.seedTenant(subscription);
    charge = await h.seedCharge(subscription, {
      dueDate: '2026-03-10',
      period: ['2026-03-01', '2026-03-31'],
    });
  });

  const refresh = (tenantId = charge.tenantId) =>
    h.refresh.execute({ tenantId, chargeId: charge.id, correlationId: 'corr-refresh' });

  it('returns the charge as the provider now says it is: paid, without waiting for the webhook', async () => {
    h.provider.simulatePayment(charge.providerChargeId!, 'PIX');

    const refreshed = await refresh();

    expect(refreshed?.status).toBe('PAID');
  });

  it('returns the charge unchanged when nothing changed at the provider', async () => {
    expect((await refresh())?.status).toBe('PENDING');
  });

  it('never throws on a provider error: the charge comes back unchanged and the page keeps polling', async () => {
    h.provider.failNextCall('UNAVAILABLE');

    const refreshed = await refresh();

    expect(refreshed?.status).toBe('PENDING');
  });

  it('another tenant’s charge id is "not found": it reads nothing from the provider', async () => {
    const fetched = jest.spyOn(h.provider, 'fetchChargeStatus');

    await expect(refresh('some-other-tenant')).resolves.toBeNull();

    expect(fetched).not.toHaveBeenCalled();
  });
});
