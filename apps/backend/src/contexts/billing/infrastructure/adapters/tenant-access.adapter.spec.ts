import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { utcDateToLocalDate } from '../../../../shared/utils/calendar-date';
import { SubscriptionBuilder, SubscriptionItemBuilder } from '../../../../test/builders/billing';
import { AdvanceableClock } from '../../../../test/infrastructure/advanceable-clock';
import { InMemoryBillingPlatformPort } from '../../../../test/infrastructure/in-memory-billing-platform.port';
import { InMemorySubscriptionRepository } from '../../../../test/repositories/billing/in-memory-subscription.repository';
import { GetBookableUntilUseCase } from '../../application/use-cases/get-bookable-until.use-case';
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
      new GetBookableUntilUseCase(subscriptions, clock),
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

  describe('getBookableUntil (M26-S18b)', () => {
    const bookingItem = (endsAt: Date | null) =>
      new SubscriptionItemBuilder()
        .withFeatureKey('BOOKING')
        .withStartsAt(new Date(NOW.getTime() - 60_000))
        .withEndsAt(endsAt)
        .build();

    it('answers the date of a pending BOOKING removal through the bookable-until use case', async () => {
      const endsAt = new Date(NOW.getTime() + 5 * 24 * 60 * 60_000);
      const subscription = new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withTimezone('America/Sao_Paulo')
        .withItems([bookingItem(endsAt)])
        .build();
      await subscriptions.save(subscription);

      await expect(adapter.getBookableUntil(subscription.tenantId)).resolves.toBe(
        utcDateToLocalDate(endsAt, 'America/Sao_Paulo'),
      );
    });

    it('answers null with no removal pending and for a tenant without a subscription', async () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withItems([bookingItem(null)])
        .build();
      await subscriptions.save(subscription);

      await expect(adapter.getBookableUntil(subscription.tenantId)).resolves.toBeNull();
      await expect(adapter.getBookableUntil(uuidv7())).resolves.toBeNull();
    });

    it('reads uncached and lets a repository error propagate', async () => {
      const failure = new Error('connection reset');
      jest.spyOn(subscriptions, 'findFreshByTenantId').mockRejectedValue(failure);
      const cached = jest.spyOn(subscriptions, 'findByTenantId');

      await expect(adapter.getBookableUntil(uuidv7())).rejects.toBe(failure);
      expect(cached).not.toHaveBeenCalled();
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
