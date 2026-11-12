import { SubscriptionBuilder, SubscriptionItemBuilder } from '../../../../test/builders/billing';
import { FixedClock } from '../../../../test/infrastructure/fixed-clock';
import { InMemorySubscriptionRepository } from '../../../../test/repositories/billing/in-memory-subscription.repository';
import { ListTenantIdsNotEntitledToUseCase } from './list-tenant-ids-not-entitled-to.use-case';

const NOW = new Date('2026-11-12T12:00:00.000Z');

describe('ListTenantIdsNotEntitledToUseCase', () => {
  let subscriptions: InMemorySubscriptionRepository;
  let useCase: ListTenantIdsNotEntitledToUseCase;

  beforeEach(() => {
    subscriptions = new InMemorySubscriptionRepository();
    useCase = new ListTenantIdsNotEntitledToUseCase(subscriptions, new FixedClock(NOW));
  });

  const item = (feature: 'HOTSITE' | 'LEAD_FORM') =>
    new SubscriptionItemBuilder()
      .withFeatureKey(feature)
      .withStartsAt(new Date(NOW.getTime() - 86_400_000))
      .build();

  it('lists an ACTIVE tenant without the item, and not one with it, a TRIALING one or a SUSPENDED one', async () => {
    const without = new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withItems([item('HOTSITE')])
      .build();
    const withItem = new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withItems([item('HOTSITE'), item('LEAD_FORM')])
      .build();
    const trialing = new SubscriptionBuilder().withStatus('TRIALING').build();
    const suspended = new SubscriptionBuilder().withSuspension('NON_PAYMENT', NOW).build();
    for (const subscription of [without, withItem, trialing, suspended]) {
      await subscriptions.save(subscription);
    }

    const result = await useCase.execute({ feature: 'LEAD_FORM' });

    expect(result.tenantIds).toEqual([without.tenantId]);
  });

  it('lists a PAST_DUE tenant without the item (it is still operational)', async () => {
    const pastDue = new SubscriptionBuilder()
      .withStatus('PAST_DUE')
      .withItems([item('HOTSITE')])
      .build();
    await subscriptions.save(pastDue);

    const result = await useCase.execute({ feature: 'LEAD_FORM' });

    expect(result.tenantIds).toEqual([pastDue.tenantId]);
  });

  it('treats an item that ended before now as not entitled', async () => {
    const ended = new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withItems([
        new SubscriptionItemBuilder()
          .withFeatureKey('LEAD_FORM')
          .withStartsAt(new Date(NOW.getTime() - 2 * 86_400_000))
          .withEndsAt(new Date(NOW.getTime() - 1000))
          .build(),
      ])
      .build();
    await subscriptions.save(ended);

    const result = await useCase.execute({ feature: 'LEAD_FORM' });

    expect(result.tenantIds).toEqual([ended.tenantId]);
  });

  it('returns ids only', async () => {
    await subscriptions.save(new SubscriptionBuilder().withStatus('ACTIVE').build());

    const result = await useCase.execute({ feature: 'LEAD_FORM' });

    expect(Object.keys(result)).toEqual(['tenantIds']);
    expect(typeof result.tenantIds[0]).toBe('string');
  });
});
