import { DataSource, EntityManager } from 'typeorm';
import { TenantBuilder } from '../../../../test/builders/platform';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { InMemoryCachePort } from '../../../../test/infrastructure/in-memory-cache.port';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { CachingTenantRepository } from './caching-tenant.repository';

describe('CachingTenantRepository', () => {
  let inner: InMemoryTenantRepository;
  let cache: InMemoryCachePort;
  let repo: CachingTenantRepository;

  beforeEach(() => {
    inner = new InMemoryTenantRepository();
    cache = new InMemoryCachePort();
    repo = new CachingTenantRepository(inner, cache);
  });

  it('serves findById from the cache when warmed, without ever querying the repository', async () => {
    const tenant = new TenantBuilder().withId('tenant-id-1').withSlug('cached-slug').build();
    // Deliberately not saved to `inner` — if the code mistakenly fell through to the repository
    // instead of reading the cache, it would find nothing and return null.
    await cache.set('platform:tenant:tenant-id-1', {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug.value,
      settings: tenant.settings.toJSON(),
      isActive: tenant.isActive,
      createdAt: tenant.createdAt.toISOString(),
      updatedAt: tenant.updatedAt.toISOString(),
    });

    const result = await repo.findById(tenant.id);

    expect(result).toMatchObject({
      id: tenant.id,
      slug: { value: 'cached-slug' },
      name: tenant.name,
      isActive: true,
    });
  });

  it('returns null, without writing to the cache, when the tenant exists in neither', async () => {
    const result = await repo.findById('nonexistent-tenant-id');

    expect(result).toBeNull();
    expect(cache.has('platform:tenant:nonexistent-tenant-id')).toBe(false);
  });

  it('falls through to the repository and warms the cache on a miss', async () => {
    const tenant = new TenantBuilder().withId('tenant-id-2').withSlug('cache-miss').build();
    await inner.save(tenant);

    const result = await repo.findById(tenant.id);

    expect(result).toBe(tenant);
    expect(cache.has('platform:tenant:tenant-id-2')).toBe(true);
  });

  it('falls through to the repository when the cache backend fails', async () => {
    const tenant = new TenantBuilder().withId('tenant-id-4').withSlug('cache-error').build();
    const warnSpy = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
    await inner.save(tenant);
    cache.failNextGet(new Error('cache unavailable'));

    const result = await repo.findById(tenant.id);

    expect(result).toBe(tenant);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cache read failed for platform:tenant:tenant-id-4'),
    );
    expect(cache.has('platform:tenant:tenant-id-4')).toBe(true);

    warnSpy.mockRestore();
  });

  it('still returns the fetched tenant when the cache write fails', async () => {
    const tenant = new TenantBuilder().withId('tenant-id-4b').withSlug('write-error').build();
    const warnSpy = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
    await inner.save(tenant);
    cache.failNextSet('not an Error instance');

    const result = await repo.findById(tenant.id);

    expect(result).toBe(tenant);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Cache write failed for platform:tenant:tenant-id-4b: not an Error instance',
      ),
    );

    warnSpy.mockRestore();
  });

  it('findByIdForUpdate always delegates straight through, bypassing the cache in both directions', async () => {
    const tenant = new TenantBuilder().withId('tenant-id-5').withSlug('locked-read').build();
    await inner.save(tenant);

    const result = await repo.findByIdForUpdate(tenant.id);

    expect(result).toBe(tenant);
    expect(cache.has('platform:tenant:tenant-id-5')).toBe(false);
  });

  it('invalidates cached tenants after the transaction commits', async () => {
    const tenant = new TenantBuilder().withId('tenant-id-3').build();
    await inner.save(tenant);
    await repo.findById(tenant.id);
    expect(cache.has(`platform:tenant:${tenant.id}`)).toBe(true);

    const mockDataSource = {
      transaction: jest.fn(async (fn: (em: EntityManager) => Promise<void>) => {
        const result = await fn({} as EntityManager);
        expect(cache.has(`platform:tenant:${tenant.id}`)).toBe(true);
        return result;
      }),
    } as unknown as DataSource;
    const txManager = new TypeOrmTransactionManager(mockDataSource);

    await txManager.run(async () => {
      await repo.save(tenant);
      expect(cache.has(`platform:tenant:${tenant.id}`)).toBe(true);
    });

    expect(cache.has(`platform:tenant:${tenant.id}`)).toBe(false);
  });

  it('does not throw when cache invalidation fails after save', async () => {
    const tenant = new TenantBuilder().withId('tenant-id-6').build();
    const warnSpy = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
    cache.failNextDel(new Error('cache unavailable'));
    const mockDataSource = {
      transaction: jest.fn(async (fn: (em: EntityManager) => Promise<void>) =>
        fn({} as EntityManager),
      ),
    } as unknown as DataSource;
    const txManager = new TypeOrmTransactionManager(mockDataSource);

    await expect(txManager.run(() => repo.save(tenant))).resolves.not.toThrow();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        `Cache invalidation failed for platform:tenant:${tenant.id}: cache unavailable`,
      ),
    );

    warnSpy.mockRestore();
  });

  it('reflects a renamed tenant only after the cache is invalidated by save()', async () => {
    const tenant = new TenantBuilder().withId('tenant-id-7').withSlug('renamed').build();
    await inner.save(tenant);
    await repo.findById(tenant.id);

    tenant.updateName('Changed Behind The Cache');
    await inner.save(tenant);
    const stillCached = await repo.findById(tenant.id);
    expect(stillCached?.name).not.toBe('Changed Behind The Cache');

    await repo.save(tenant);
    const fresh = await repo.findById(tenant.id);
    expect(fresh?.name).toBe('Changed Behind The Cache');
  });

  it('delegates read operations that are not cacheable', async () => {
    const tenant = new TenantBuilder().withId('tenant-id-8').withSlug('slug-a').build();
    await inner.save(tenant);

    await expect(repo.findBySlug('slug-a')).resolves.toBe(tenant);
    await expect(repo.findByIds(['tenant-id-8'])).resolves.toEqual([tenant]);
    await expect(repo.findMany({ slug: 'slug-a' })).resolves.toEqual([tenant]);
    await expect(repo.findMany()).resolves.toEqual([tenant]);
    await expect(repo.findAllActive()).resolves.toEqual([tenant]);
    await expect(repo.existsBySlug('slug-a')).resolves.toBe(true);
    expect(cache.has('platform:tenant:tenant-id-8')).toBe(false);
  });
});
