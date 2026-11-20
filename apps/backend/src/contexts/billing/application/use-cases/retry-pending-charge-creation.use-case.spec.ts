import { ChargeBuilder, SubscriptionBuilder } from '../../../../test/builders/billing';
import { createIssueHarness } from '../../../../test/infrastructure/billing-issue-harness';
import type { Charge } from '../../domain/charge.aggregate';
import type { Subscription } from '../../domain/subscription.aggregate';

describe('RetryPendingChargeCreationUseCase (UC-113 A2)', () => {
  let h: ReturnType<typeof createIssueHarness>;

  beforeEach(() => {
    h = createIssueHarness();
  });

  const run = () => h.retry.execute({ correlationId: 'corr-1' });

  const withPendingCharge = async (
    subscription: Subscription,
    options: { billable?: boolean; recovery?: boolean } = {},
  ): Promise<Charge> => {
    await h.seedTenant(subscription, { billable: options.billable });
    const builder = new ChargeBuilder()
      .withTenantId(subscription.tenantId)
      .withSubscriptionId(subscription.id);
    const charge = (options.recovery ? builder.asRecovery() : builder).build();
    await h.charges.save(charge);
    return charge;
  };

  it('creates a charge left PENDING at the provider, once, and announces it', async () => {
    const subscription = new SubscriptionBuilder().withStatus('ACTIVE').build();
    const charge = await withPendingCharge(subscription);

    await expect(run()).resolves.toEqual({ selected: 1, ready: 1 });

    expect(
      (await h.charges.findById(subscription.tenantId, charge.id))?.providerCreationStatus,
    ).toBe('READY');
    expect(h.provider.charges.size).toBe(1);
    expect(h.outbox.published.filter((e) => e.eventName === 'ChargeIssued')).toHaveLength(1);

    await expect(run()).resolves.toEqual({ selected: 0, ready: 0 });
    expect(h.provider.charges.size).toBe(1);
  });

  it('reaches a SUSPENDED tenant’s recovery charge: the selection has no status filter', async () => {
    const subscription = new SubscriptionBuilder()
      .withSuspension('NON_PAYMENT', new Date('2026-03-01T12:00:00Z'))
      .build();
    const charge = await withPendingCharge(subscription, { recovery: true });

    await expect(run()).resolves.toEqual({ selected: 1, ready: 1 });

    expect(
      (await h.charges.findById(subscription.tenantId, charge.id))?.providerChargeId,
    ).not.toBeNull();
  });

  it('a recovery charge held for lack of identity makes no provider call and counts no attempt, then resumes once saved', async () => {
    const subscription = new SubscriptionBuilder()
      .withSuspension('NON_PAYMENT', new Date('2026-03-01T12:00:00Z'))
      .build();
    const charge = await withPendingCharge(subscription, { recovery: true, billable: false });

    await expect(run()).resolves.toEqual({ selected: 1, ready: 0 });
    await expect(run()).resolves.toEqual({ selected: 1, ready: 0 });

    expect(h.provider.charges.size).toBe(0);
    expect(h.charges.claimedAttempts(charge.id)).toBe(0);
  });

  it('a charge whose lease is still held is left to its creator', async () => {
    const subscription = new SubscriptionBuilder().withStatus('ACTIVE').build();
    const charge = await withPendingCharge(subscription);
    await h.charges.claimForProviderCreation(subscription.tenantId, charge.id, h.clock.now());

    await expect(run()).resolves.toEqual({ selected: 0, ready: 0 });
  });
});
