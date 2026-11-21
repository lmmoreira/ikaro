import { EntityManager } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import {
  createTransactionContext,
  flushAfterCommitCallbacks,
  runWithTransactionContext,
} from '../../../../shared/infrastructure/transaction-context';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { SubscriptionBuilder, SubscriptionItemBuilder } from '../../../../test/builders/billing';
import { AdvanceableClock } from '../../../../test/infrastructure/advanceable-clock';
import { InMemoryCachePort } from '../../../../test/infrastructure/in-memory-cache.port';
import { InMemorySubscriptionRepository } from '../../../../test/repositories/billing/in-memory-subscription.repository';
import { CachingSubscriptionRepository } from './caching-subscription.repository';

const NOW = new Date('2026-11-12T12:00:00.000Z');
const keyOf = (tenantId: string) => `billing:subscription:${tenantId}`;

describe('CachingSubscriptionRepository', () => {
  let inner: InMemorySubscriptionRepository;
  let clock: AdvanceableClock;
  let cache: InMemoryCachePort;
  let repo: CachingSubscriptionRepository;

  beforeEach(() => {
    inner = new InMemorySubscriptionRepository();
    clock = new AdvanceableClock(NOW);
    cache = new InMemoryCachePort(clock);
    repo = new CachingSubscriptionRepository(inner, cache);
  });

  describe('findByTenantId', () => {
    it('falls through to the repository on a miss and warms the cache', async () => {
      const subscription = new SubscriptionBuilder().withStatus('ACTIVE').build();
      await inner.save(subscription);

      const result = await repo.findByTenantId(subscription.tenantId);

      expect(result).toBe(subscription);
      expect(cache.has(keyOf(subscription.tenantId))).toBe(true);
    });

    it('serves a warmed read from the cache without querying the repository', async () => {
      const subscription = new SubscriptionBuilder().withStatus('ACTIVE').build();
      await inner.save(subscription);
      await repo.findByTenantId(subscription.tenantId);
      // The row changes behind the cache; a cached read must not see it.
      inner.saved[0] = new SubscriptionBuilder()
        .withTenantId(subscription.tenantId)
        .withSuspension('OPERATOR', NOW)
        .build();

      const cached = await repo.findByTenantId(subscription.tenantId);

      expect(cached?.status).toBe('ACTIVE');
    });

    it('returns null and caches nothing for a tenant with no subscription', async () => {
      const tenantId = uuidv7();

      await expect(repo.findByTenantId(tenantId)).resolves.toBeNull();

      expect(cache.has(keyOf(tenantId))).toBe(false);
      expect(cache.setCalls).toHaveLength(0);
    });

    it('reproduces the aggregate exactly through the cache record, dates, value objects and items included', async () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('PAST_DUE')
        .withCountryCode('BR')
        .withTimezone('America/Sao_Paulo')
        .withNextDueDate('2026-12-15')
        .withPastDueSince(new Date('2026-11-01T03:00:00.000Z'))
        .withGraceUntil(new Date('2026-11-20T03:00:00.000Z'))
        .withHasEverPaid(true)
        .withExempt(false)
        .withItems([
          new SubscriptionItemBuilder().withFeatureKey('HOTSITE').build(),
          new SubscriptionItemBuilder()
            .withFeatureKey('CHATBOT')
            .withTier('PLUS')
            .withEndsAt(new Date('2027-01-01T00:00:00.000Z'))
            .build(),
        ])
        .withVersion(3)
        .build();
      await inner.save(subscription);
      await repo.findByTenantId(subscription.tenantId);

      const fromCache = await repo.findByTenantId(subscription.tenantId);

      expect(fromCache).not.toBe(subscription);
      expect(fromCache).toEqual(subscription);
      expect(fromCache?.nextDueDate?.value).toBe('2026-12-15');
      expect(fromCache?.timezone.value).toBe('America/Sao_Paulo');
      expect(fromCache?.version).toBe(3);
      expect(fromCache?.entitledAt(NOW)).toEqual(subscription.entitledAt(NOW));
    });

    it('falls through to the repository when the cache read fails', async () => {
      const warn = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
      const subscription = new SubscriptionBuilder().withStatus('ACTIVE').build();
      await inner.save(subscription);
      cache.failNextGet(new Error('cache unavailable'));

      const result = await repo.findByTenantId(subscription.tenantId);

      expect(result).toBe(subscription);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Cache read failed'));
      warn.mockRestore();
    });

    it('still returns the subscription when the cache write fails', async () => {
      const warn = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
      const subscription = new SubscriptionBuilder().withStatus('ACTIVE').build();
      await inner.save(subscription);
      cache.failNextSet(new Error('cache unavailable'));

      await expect(repo.findByTenantId(subscription.tenantId)).resolves.toBe(subscription);

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Cache write failed'));
      warn.mockRestore();
    });
  });

  describe('asymmetric TTLs on a fake clock', () => {
    it('caches an operational subscription for 300 s', async () => {
      const subscription = new SubscriptionBuilder().withStatus('ACTIVE').build();
      await inner.save(subscription);
      await repo.findByTenantId(subscription.tenantId);

      clock.advanceMs(299_000);
      expect(cache.has(keyOf(subscription.tenantId))).toBe(true);
      clock.advanceMs(1_000);
      expect(cache.has(keyOf(subscription.tenantId))).toBe(false);
      expect(cache.setCalls[0].ttlMs).toBe(300_000);
    });

    it('caches a SUSPENDED subscription for only 10 s', async () => {
      const subscription = new SubscriptionBuilder().withSuspension('NON_PAYMENT', NOW).build();
      await inner.save(subscription);
      await repo.findByTenantId(subscription.tenantId);

      clock.advanceMs(9_000);
      expect(cache.has(keyOf(subscription.tenantId))).toBe(true);
      clock.advanceMs(1_000);
      expect(cache.has(keyOf(subscription.tenantId))).toBe(false);
      expect(cache.setCalls[0].ttlMs).toBe(10_000);
    });
  });

  describe('findByTenantIdForUpdate', () => {
    it('bypasses the cache in both directions', async () => {
      const subscription = new SubscriptionBuilder().withStatus('ACTIVE').build();
      await inner.save(subscription);

      const result = await repo.findByTenantIdForUpdate(subscription.tenantId);

      expect(result).toBe(subscription);
      expect(cache.getCalls).toHaveLength(0);
      expect(cache.setCalls).toHaveLength(0);
    });
  });

  describe('save', () => {
    it('evicts the cached subscription only after the transaction commits', async () => {
      const subscription = new SubscriptionBuilder().withStatus('ACTIVE').build();
      await inner.save(subscription);
      await repo.findByTenantId(subscription.tenantId);
      const context = createTransactionContext({} as EntityManager);

      await runWithTransactionContext(context, () => repo.save(subscription));
      expect(cache.has(keyOf(subscription.tenantId))).toBe(true);
      await flushAfterCommitCallbacks(context);

      expect(cache.has(keyOf(subscription.tenantId))).toBe(false);
    });

    it('reflects a change only after save() evicts the cached copy', async () => {
      const subscription = new SubscriptionBuilder().withStatus('ACTIVE').build();
      await inner.save(subscription);
      await repo.findByTenantId(subscription.tenantId);
      inner.saved[0] = new SubscriptionBuilder()
        .withTenantId(subscription.tenantId)
        .withSuspension('OPERATOR', NOW)
        .withVersion(1)
        .build();
      expect((await repo.findByTenantId(subscription.tenantId))?.status).toBe('ACTIVE');

      await repo.save(inner.saved[0]);

      expect((await repo.findByTenantId(subscription.tenantId))?.status).toBe('SUSPENDED');
    });

    it('never throws when the eviction fails (best-effort)', async () => {
      const warn = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
      const subscription = new SubscriptionBuilder().withStatus('ACTIVE').build();
      await inner.save(subscription);
      cache.failNextDel(new Error('cache unavailable'));

      await expect(repo.save(subscription)).resolves.toBeUndefined();

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Cache invalidation failed'));
      warn.mockRestore();
    });
  });

  describe('cross-tenant batch reads', () => {
    it('delegate to the repository, uncached', async () => {
      const suspended = new SubscriptionBuilder().withSuspension('OPERATOR', NOW).build();
      const lacking = new SubscriptionBuilder().withStatus('ACTIVE').build();
      await inner.save(suspended);
      await inner.save(lacking);

      await expect(repo.listSuspendedTenantIds()).resolves.toEqual([suspended.tenantId]);
      await expect(repo.findTenantIdsNotEntitledTo('LEAD_FORM', NOW)).resolves.toEqual([
        lacking.tenantId,
      ]);
      expect(cache.getCalls).toHaveLength(0);
    });

    it('forwards the merchant profile keys read of reconcile (UC-116) to the repository, uncached', async () => {
      await inner.save(new SubscriptionBuilder().withMerchantProfileKey('BRL_FAKE').build());
      await inner.save(new SubscriptionBuilder().withMerchantProfileKey('BRL_FAKE').build());
      await inner.save(new SubscriptionBuilder().withMerchantProfileKey('USD_FAKE').build());

      await expect(repo.listMerchantProfileKeys()).resolves.toEqual(['BRL_FAKE', 'USD_FAKE']);
      expect(cache.getCalls).toHaveLength(0);
    });

    it('forwards the status sweep selectors (UC-115) to the repository, uncached, paging included', async () => {
      const ended = new SubscriptionBuilder()
        .withStatus('TRIALING')
        .withTrialEndsAt(new Date(NOW.getTime() - 3 * 86_400_000))
        .build();
      const lapsed = new SubscriptionBuilder()
        .withStatus('PAST_DUE')
        .withPastDueSince(new Date(NOW.getTime() - 20 * 86_400_000))
        .build();
      const cancelling = new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withCancelAt(new Date(NOW.getTime() - 86_400_000))
        .build();
      for (const subscription of [ended, lapsed, cancelling]) await inner.save(subscription);

      const trial = await repo.findTrialEndedForJob(NOW, 10);
      const grace = await repo.findGraceExpiredForJob(NOW, 10);
      const cancel = await repo.findCancelDueForJob(NOW, 10);

      expect(trial.map((ref) => ref.tenantId)).toEqual([ended.tenantId]);
      expect(grace.map((ref) => ref.tenantId)).toEqual([lapsed.tenantId]);
      expect(cancel.map((ref) => ref.tenantId)).toEqual([cancelling.tenantId]);
      // The keyset reaches the repository: a page after the only row is empty.
      await expect(repo.findTrialEndedForJob(NOW, 10, trial[0])).resolves.toEqual([]);
      expect(cache.getCalls).toHaveLength(0);
    });
  });
});
