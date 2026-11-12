import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { SubscriptionBuilder, SubscriptionItemBuilder } from '../../../../test/builders/billing';
import { AdvanceableClock } from '../../../../test/infrastructure/advanceable-clock';
import { InMemoryBillingPlatformPort } from '../../../../test/infrastructure/in-memory-billing-platform.port';
import { InMemoryCachePort } from '../../../../test/infrastructure/in-memory-cache.port';
import { InMemorySubscriptionRepository } from '../../../../test/repositories/billing/in-memory-subscription.repository';
import { GetTenantAccessUseCase } from '../../application/use-cases/get-tenant-access.use-case';
import { ListSuspendedTenantIdsUseCase } from '../../application/use-cases/list-suspended-tenant-ids.use-case';
import { ListTenantIdsNotEntitledToUseCase } from '../../application/use-cases/list-tenant-ids-not-entitled-to.use-case';
import { CachingTenantAccessAdapter } from './caching-tenant-access.adapter';
import { tenantAccessCacheKey } from './tenant-access-cache-key';
import { TenantAccessCacheInvalidatorAdapter } from './tenant-access-cache-invalidator.adapter';

const NOW = new Date('2026-11-12T12:00:00.000Z');

describe('CachingTenantAccessAdapter', () => {
  let subscriptions: InMemorySubscriptionRepository;
  let platform: InMemoryBillingPlatformPort;
  let clock: AdvanceableClock;
  let cache: InMemoryCachePort;
  let adapter: CachingTenantAccessAdapter;

  beforeEach(() => {
    subscriptions = new InMemorySubscriptionRepository();
    platform = new InMemoryBillingPlatformPort();
    clock = new AdvanceableClock(NOW);
    cache = new InMemoryCachePort(clock);
    adapter = new CachingTenantAccessAdapter(
      new GetTenantAccessUseCase(subscriptions, platform, clock),
      new ListSuspendedTenantIdsUseCase(subscriptions),
      new ListTenantIdsNotEntitledToUseCase(subscriptions, clock),
      cache,
    );
  });

  describe('TTLs on a fake clock', () => {
    it('caches an operational answer for 60 s, then reads the subscription again', async () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withItems([new SubscriptionItemBuilder().withFeatureKey('HOTSITE').build()])
        .build();
      await subscriptions.save(subscription);

      const first = await adapter.getAccess(subscription.tenantId);
      // The subscription changes underneath, but the cached answer still stands for 59 s.
      subscriptions.saved[0] = new SubscriptionBuilder()
        .withTenantId(subscription.tenantId)
        .withSuspension('OPERATOR', NOW)
        .build();
      clock.advanceMs(59_000);
      const stillCached = await adapter.getAccess(subscription.tenantId);
      clock.advanceMs(1_000);
      const refreshed = await adapter.getAccess(subscription.tenantId);

      expect(first.operational).toBe(true);
      expect(stillCached).toEqual(first);
      expect(refreshed.operational).toBe(false);
      expect(cache.setCalls[0].ttlMs).toBe(60_000);
    });

    it('caches a suspended answer for only 10 s', async () => {
      const subscription = new SubscriptionBuilder().withSuspension('NON_PAYMENT', NOW).build();
      await subscriptions.save(subscription);

      const first = await adapter.getAccess(subscription.tenantId);
      subscriptions.saved[0] = new SubscriptionBuilder()
        .withTenantId(subscription.tenantId)
        .withStatus('ACTIVE')
        .build();
      clock.advanceMs(9_000);
      const stillSuspended = await adapter.getAccess(subscription.tenantId);
      clock.advanceMs(1_000);
      const back = await adapter.getAccess(subscription.tenantId);

      expect(first.operational).toBe(false);
      expect(stillSuspended.operational).toBe(false);
      expect(back.operational).toBe(true);
      expect(cache.setCalls[0].ttlMs).toBe(10_000);
    });

    it('caches the provisional within-window answer for 60 s like any operational answer', async () => {
      const tenantId = uuidv7();
      platform.seed({
        tenantId,
        slug: 's',
        countryCode: 'BR',
        timezone: 'America/Sao_Paulo',
        createdAt: new Date(NOW.getTime() - 60_000),
      });

      const access = await adapter.getAccess(tenantId);

      expect(access.provisional).toBe(true);
      expect(cache.setCalls[0].ttlMs).toBe(60_000);
    });
  });

  describe('failure semantics', () => {
    it('does not cache the fail-open answer: a second call after recovery returns the real one', async () => {
      const subscription = new SubscriptionBuilder().withSuspension('OPERATOR', NOW).build();
      await subscriptions.save(subscription);
      subscriptions.failNextFind(new Error('connection reset'));

      const degraded = await adapter.getAccess(subscription.tenantId);
      const recovered = await adapter.getAccess(subscription.tenantId);

      expect(degraded.degraded).toBe(true);
      expect(degraded.operational).toBe(true);
      expect(cache.has(tenantAccessCacheKey(subscription.tenantId))).toBe(true);
      expect(recovered.degraded).toBeUndefined();
      expect(recovered.operational).toBe(false);
      expect(cache.setCalls).toHaveLength(1);
    });

    it('falls through to the use case when the cache read fails', async () => {
      const subscription = new SubscriptionBuilder().withStatus('ACTIVE').build();
      await subscriptions.save(subscription);
      cache.failNextGet(new Error('redis down'));

      const access = await adapter.getAccess(subscription.tenantId);

      expect(access.status).toBe('ACTIVE');
    });

    it('still answers when the cache write fails', async () => {
      const subscription = new SubscriptionBuilder().withStatus('ACTIVE').build();
      await subscriptions.save(subscription);
      cache.failNextSet(new Error('redis down'));

      await expect(adapter.getAccess(subscription.tenantId)).resolves.toMatchObject({
        status: 'ACTIVE',
      });
    });

    it('lets an unknown tenant through as a typed not-found and caches nothing', async () => {
      await expect(adapter.getAccess(uuidv7())).rejects.toMatchObject({
        name: 'BillingTenantNotFoundError',
      });
      expect(cache.setCalls).toHaveLength(0);
    });
  });

  describe('invalidation', () => {
    it('evicts the cached answer through the invalidator, sharing one key builder', async () => {
      const subscription = new SubscriptionBuilder().withStatus('ACTIVE').build();
      await subscriptions.save(subscription);
      await adapter.getAccess(subscription.tenantId);
      expect(cache.has(tenantAccessCacheKey(subscription.tenantId))).toBe(true);

      await new TenantAccessCacheInvalidatorAdapter(cache).invalidate(subscription.tenantId);

      expect(cache.has(tenantAccessCacheKey(subscription.tenantId))).toBe(false);
    });
  });

  describe('batch methods', () => {
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
});
