import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { SubscriptionBuilder } from '../../../../test/builders/billing';
import { AdvanceableClock } from '../../../../test/infrastructure/advanceable-clock';
import { InMemoryBillingPlatformPort } from '../../../../test/infrastructure/in-memory-billing-platform.port';
import { InMemorySubscriptionRepository } from '../../../../test/repositories/billing/in-memory-subscription.repository';
import { GetTenantAccessUseCase } from '../../application/use-cases/get-tenant-access.use-case';
import { ListSuspendedTenantIdsUseCase } from '../../application/use-cases/list-suspended-tenant-ids.use-case';
import { ListTenantIdsNotEntitledToUseCase } from '../../application/use-cases/list-tenant-ids-not-entitled-to.use-case';
import { BillingTenantNotFoundError } from '../../domain/errors/billing-domain.error';
import { TenantAccessAdapter } from './tenant-access.adapter';

const NOW = new Date('2026-11-12T12:00:00.000Z');

describe('TenantAccessAdapter', () => {
  let subscriptions: InMemorySubscriptionRepository;
  let adapter: TenantAccessAdapter;

  beforeEach(() => {
    subscriptions = new InMemorySubscriptionRepository();
    const clock = new AdvanceableClock(NOW);
    adapter = new TenantAccessAdapter(
      new GetTenantAccessUseCase(subscriptions, new InMemoryBillingPlatformPort(), clock),
      new ListSuspendedTenantIdsUseCase(subscriptions),
      new ListTenantIdsNotEntitledToUseCase(subscriptions, clock),
    );
  });

  it('answers getAccess through the access use case', async () => {
    const subscription = new SubscriptionBuilder().withSuspension('OPERATOR', NOW).build();
    await subscriptions.save(subscription);

    await expect(adapter.getAccess(subscription.tenantId)).resolves.toEqual({
      status: 'SUSPENDED',
      suspensionReason: 'OPERATOR',
      operational: false,
      features: [],
    });
  });

  it('lets an unknown tenant through as a typed not-found', async () => {
    await expect(adapter.getAccess(uuidv7())).rejects.toBeInstanceOf(BillingTenantNotFoundError);
  });

  it('lists suspended tenant ids and the tenants lacking a feature, ids only', async () => {
    const suspended = new SubscriptionBuilder().withSuspension('OPERATOR', NOW).build();
    const lacking = new SubscriptionBuilder().withStatus('ACTIVE').build();
    await subscriptions.save(suspended);
    await subscriptions.save(lacking);

    await expect(adapter.listSuspendedTenantIds()).resolves.toEqual([suspended.tenantId]);
    await expect(adapter.findTenantIdsNotEntitledTo('LEAD_FORM')).resolves.toEqual([
      lacking.tenantId,
    ]);
  });
});
