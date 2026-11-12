import { SubscriptionBuilder } from '../../../../test/builders/billing';
import { InMemorySubscriptionRepository } from '../../../../test/repositories/billing/in-memory-subscription.repository';
import { ListSuspendedTenantIdsUseCase } from './list-suspended-tenant-ids.use-case';

describe('ListSuspendedTenantIdsUseCase', () => {
  it('returns exactly the suspended tenants, as ids only', async () => {
    const subscriptions = new InMemorySubscriptionRepository();
    const suspended = new SubscriptionBuilder().withSuspension('OPERATOR', new Date()).build();
    const trialing = new SubscriptionBuilder().withStatus('TRIALING').build();
    const active = new SubscriptionBuilder().withStatus('ACTIVE').build();
    for (const subscription of [suspended, trialing, active])
      await subscriptions.save(subscription);

    const result = await new ListSuspendedTenantIdsUseCase(subscriptions).execute();

    expect(result).toEqual({ tenantIds: [suspended.tenantId] });
  });
});
