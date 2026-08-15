import { DataSource, EntityManager } from 'typeorm';
import { ServiceBuilder } from '../../../../test/builders/booking';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { InMemoryCachePort } from '../../../../test/infrastructure/in-memory-cache.port';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { Money } from '../../../../shared/value-objects/money';
import { CachingServiceRepository } from './caching-service.repository';

describe('CachingServiceRepository', () => {
  let inner: InMemoryServiceRepository;
  let cache: InMemoryCachePort;
  let repo: CachingServiceRepository;

  beforeEach(() => {
    inner = new InMemoryServiceRepository();
    cache = new InMemoryCachePort();
    repo = new CachingServiceRepository(inner, cache);
  });

  it('serves an unfiltered, status-only call from the cache on a hit, not from the repository', async () => {
    const service = new ServiceBuilder().withTenantId('tenant-1').withName('Original Name').build();
    await inner.save(service);
    await repo.findAllByTenant('tenant-1', { status: 'ACTIVE' });

    expect(cache.has('booking:service:v2:tenant-1:ACTIVE')).toBe(true);

    // Mutate the same service directly on the underlying repository — bypassing the caching
    // decorator entirely, the way an out-of-band write would. If the second call actually reads
    // the repo instead of the warmed cache, it would see this change.
    service.update(
      'Changed Behind The Cache',
      service.description,
      service.price,
      service.durationMinutes,
      service.loyaltyPointsValue,
      service.requiresPickupAddress,
    );
    await inner.save(service);

    const second = await repo.findAllByTenant('tenant-1', { status: 'ACTIVE' });
    expect(second.map((s) => s.name)).toEqual(['Original Name']);
  });

  it('falls through to the repository and warms the cache on a miss', async () => {
    const service = new ServiceBuilder().withTenantId('tenant-2').build();
    await inner.save(service);

    const result = await repo.findAllByTenant('tenant-2', { status: 'ANY' });

    expect(result).toEqual([service]);
    expect(cache.has('booking:service:v2:tenant-2:ANY')).toBe(true);
  });

  it('falls through to the repository when the cache read fails, without throwing', async () => {
    const service = new ServiceBuilder().withTenantId('tenant-3').build();
    await inner.save(service);
    const warnSpy = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
    cache.failNextGet(new Error('cache unavailable'));

    const result = await repo.findAllByTenant('tenant-3', { status: 'ACTIVE' });

    expect(result).toEqual([service]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cache read failed for booking:service:v2:tenant-3:ACTIVE'),
    );

    warnSpy.mockRestore();
  });

  it('still returns the fetched services when the cache write fails', async () => {
    const service = new ServiceBuilder().withTenantId('tenant-4').build();
    await inner.save(service);
    const warnSpy = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
    cache.failNextSet(new Error('cache unavailable'));

    const result = await repo.findAllByTenant('tenant-4', { status: 'ACTIVE' });

    expect(result).toEqual([service]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cache write failed for booking:service:v2:tenant-4:ACTIVE'),
    );
    expect(cache.has('booking:service:v2:tenant-4:ACTIVE')).toBe(false);

    warnSpy.mockRestore();
  });

  it('still returns the fetched services when the cache rejects with a non-Error value', async () => {
    const service = new ServiceBuilder().withTenantId('tenant-4b').build();
    await inner.save(service);
    const warnSpy = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
    cache.failNextSet('not an Error instance');

    const result = await repo.findAllByTenant('tenant-4b', { status: 'ACTIVE' });

    expect(result).toEqual([service]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Cache write failed for booking:service:v2:tenant-4b:ACTIVE: not an Error instance',
      ),
    );

    warnSpy.mockRestore();
  });

  it('bypasses the cache entirely when a search filter is present', async () => {
    const service = new ServiceBuilder().withTenantId('tenant-5').withName('Lavagem').build();
    await inner.save(service);

    await repo.findAllByTenant('tenant-5', { status: 'ACTIVE', search: 'lavagem' });

    expect(cache.has('booking:service:v2:tenant-5:ACTIVE')).toBe(false);
  });

  it('bypasses the cache entirely when an ids filter is present', async () => {
    const service = new ServiceBuilder().withTenantId('tenant-6').withName('Before').build();
    await inner.save(service);
    await repo.findAllByTenant('tenant-6', { ids: [service.id] });

    service.update(
      'After',
      service.description,
      service.price,
      service.durationMinutes,
      service.loyaltyPointsValue,
      service.requiresPickupAddress,
    );
    await inner.save(service);

    const second = await repo.findAllByTenant('tenant-6', { ids: [service.id] });
    expect(second.map((s) => s.name)).toEqual(['After']);
  });

  it('bypasses the cache entirely when no status filter is given', async () => {
    const service = new ServiceBuilder().withTenantId('tenant-7').withName('Before').build();
    await inner.save(service);
    await repo.findAllByTenant('tenant-7');

    service.update(
      'After',
      service.description,
      service.price,
      service.durationMinutes,
      service.loyaltyPointsValue,
      service.requiresPickupAddress,
    );
    await inner.save(service);

    const second = await repo.findAllByTenant('tenant-7');
    expect(second.map((s) => s.name)).toEqual(['After']);
  });

  it('findById and findByIds always delegate straight through, bypassing the cache', async () => {
    const service = new ServiceBuilder().withTenantId('tenant-8').build();
    await inner.save(service);

    await expect(repo.findById(service.id, service.tenantId)).resolves.toEqual(service);
    await expect(repo.findByIds([service.id], service.tenantId)).resolves.toEqual([service]);
    expect(cache.has(`booking:service:v2:tenant-8:ACTIVE`)).toBe(false);
  });

  it('never returns another tenant’s cached services (cross-tenant isolation)', async () => {
    const tenant1Service = new ServiceBuilder()
      .withTenantId('tenant-9a')
      .withName('Tenant 9a Service')
      .build();
    const tenant2Service = new ServiceBuilder()
      .withTenantId('tenant-9b')
      .withName('Tenant 9b Service')
      .build();
    await inner.save(tenant1Service);
    await inner.save(tenant2Service);

    await repo.findAllByTenant('tenant-9a', { status: 'ACTIVE' });
    const tenant2Result = await repo.findAllByTenant('tenant-9b', { status: 'ACTIVE' });

    expect(cache.has('booking:service:v2:tenant-9a:ACTIVE')).toBe(true);
    expect(cache.has('booking:service:v2:tenant-9b:ACTIVE')).toBe(true);
    expect(tenant2Result).toEqual([tenant2Service]);
    expect(tenant2Result.map((s) => s.name)).not.toContain('Tenant 9a Service');
  });

  it('round-trips a non-default currency through the cache without any live settings lookup', async () => {
    const service = new ServiceBuilder()
      .withTenantId('tenant-10')
      .withPrice(Money.from(199.99, 'USD'))
      .build();
    await inner.save(service);

    await repo.findAllByTenant('tenant-10', { status: 'ACTIVE' });
    const [cached] = await repo.findAllByTenant('tenant-10', { status: 'ACTIVE' });

    expect(cached.price.currency).toBe('USD');
    expect(cached.price.amount.toFixed(2)).toBe('199.99');
  });

  it('invalidates all 3 status-keyed cache entries for the tenant after the transaction commits', async () => {
    const service = new ServiceBuilder().withTenantId('tenant-11').build();
    await repo.findAllByTenant('tenant-11', { status: 'ACTIVE' });
    await repo.findAllByTenant('tenant-11', { status: 'INACTIVE' });
    await repo.findAllByTenant('tenant-11', { status: 'ANY' });
    expect(cache.has('booking:service:v2:tenant-11:ACTIVE')).toBe(true);
    expect(cache.has('booking:service:v2:tenant-11:INACTIVE')).toBe(true);
    expect(cache.has('booking:service:v2:tenant-11:ANY')).toBe(true);

    const mockDataSource = {
      transaction: jest.fn(async (fn: (em: EntityManager) => Promise<void>) =>
        fn({} as EntityManager),
      ),
    } as unknown as DataSource;
    const txManager = new TypeOrmTransactionManager(mockDataSource);

    await txManager.run(() => repo.save(service));

    expect(cache.has('booking:service:v2:tenant-11:ACTIVE')).toBe(false);
    expect(cache.has('booking:service:v2:tenant-11:INACTIVE')).toBe(false);
    expect(cache.has('booking:service:v2:tenant-11:ANY')).toBe(false);
  });

  it('does not throw when cache invalidation fails after save', async () => {
    const service = new ServiceBuilder().withTenantId('tenant-12').build();
    const warnSpy = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
    cache.failNextDel(new Error('cache unavailable'));
    const mockDataSource = {
      transaction: jest.fn(async (fn: (em: EntityManager) => Promise<void>) =>
        fn({} as EntityManager),
      ),
    } as unknown as DataSource;
    const txManager = new TypeOrmTransactionManager(mockDataSource);

    await expect(txManager.run(() => repo.save(service))).resolves.not.toThrow();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cache invalidation failed for tenant tenant-12: cache unavailable'),
    );

    warnSpy.mockRestore();
  });
});
