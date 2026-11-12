import { SubscriptionBuilder } from '../../../../test/builders/billing';
import { InMemorySubscriptionRepository } from '../../../../test/repositories/billing/in-memory-subscription.repository';
import { ListTenantBillingStatusUseCase } from './list-tenant-billing-status.use-case';

describe('ListTenantBillingStatusUseCase', () => {
  let subscriptions: InMemorySubscriptionRepository;
  let useCase: ListTenantBillingStatusUseCase;

  beforeEach(() => {
    subscriptions = new InMemorySubscriptionRepository();
    useCase = new ListTenantBillingStatusUseCase(subscriptions);
  });

  it('returns the subscription-derived fields only, as ISO strings, with the pagination envelope', async () => {
    const suspendedAt = new Date('2026-11-01T08:00:00.000Z');
    const subscription = new SubscriptionBuilder()
      .withSuspension('OPERATOR', suspendedAt)
      .withTrialEndsAt(null)
      .build();
    await subscriptions.save(subscription);

    const result = await useCase.execute({ limit: 25, offset: 0 });

    expect(result.pagination).toEqual({ limit: 25, offset: 0, total: 1, hasMore: false });
    expect(result.items).toEqual([
      {
        tenantId: subscription.tenantId,
        status: 'SUSPENDED',
        suspensionReason: 'OPERATOR',
        exempt: false,
        trialEndsAt: null,
        graceUntil: null,
        pastDueSince: null,
        suspendedAt: suspendedAt.toISOString(),
        hasEverPaid: false,
      },
    ]);
  });

  it('narrows to one status and pages with hasMore', async () => {
    for (let i = 0; i < 3; i += 1) {
      await subscriptions.save(new SubscriptionBuilder().withStatus('ACTIVE').build());
    }
    await subscriptions.save(new SubscriptionBuilder().withStatus('PAST_DUE').build());

    const page = await useCase.execute({ status: 'ACTIVE', limit: 2, offset: 0 });
    const rest = await useCase.execute({ status: 'ACTIVE', limit: 2, offset: 2 });

    expect(page.items).toHaveLength(2);
    expect(page.pagination).toMatchObject({ total: 3, hasMore: true });
    expect(rest.items).toHaveLength(1);
    expect(rest.pagination.hasMore).toBe(false);
    expect([...page.items, ...rest.items].every((item) => item.status === 'ACTIVE')).toBe(true);
  });
});
