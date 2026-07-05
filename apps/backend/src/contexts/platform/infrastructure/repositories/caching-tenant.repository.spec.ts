import { Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { TenantBuilder } from '../../../../test/builders/platform';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import { TypeOrmTenantRepository } from './typeorm-tenant.repository';
import { CachingTenantRepository } from './caching-tenant.repository';

describe('CachingTenantRepository', () => {
  let typeOrmRepo: jest.Mocked<TypeOrmTenantRepository>;
  let cachePort: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
  };
  let repo: CachingTenantRepository;

  beforeEach(() => {
    typeOrmRepo = {
      findBySlug: jest.fn(),
      findById: jest.fn(),
      findByIds: jest.fn(),
      findMany: jest.fn(),
      findAllActive: jest.fn(),
      save: jest.fn(),
      existsBySlug: jest.fn(),
    } as unknown as jest.Mocked<TypeOrmTenantRepository>;

    cachePort = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    repo = new CachingTenantRepository(typeOrmRepo, cachePort as never);
  });

  it('uses the cache on findById and stores hydrated tenants back into the cache', async () => {
    const tenant = new TenantBuilder().withId('tenant-id-1').withSlug('cached-slug').build();

    cachePort.get.mockResolvedValue({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug.value,
      settings: tenant.settings.toJSON(),
      isActive: tenant.isActive,
      createdAt: tenant.createdAt.toISOString(),
      updatedAt: tenant.updatedAt.toISOString(),
    });

    await expect(repo.findById(tenant.id)).resolves.toMatchObject({
      id: tenant.id,
      slug: { value: 'cached-slug' },
      name: tenant.name,
      isActive: true,
    });

    expect(cachePort.get).toHaveBeenCalledWith('platform:tenant:tenant-id-1');
    expect(typeOrmRepo.findById).not.toHaveBeenCalled();
    expect(cachePort.set).not.toHaveBeenCalled();
  });

  it('falls through to the repository and warms the cache on misses', async () => {
    const tenant = new TenantBuilder().withId('tenant-id-2').withSlug('cache-miss').build();

    cachePort.get.mockResolvedValue(null);
    typeOrmRepo.findById.mockResolvedValue(tenant);

    await expect(repo.findById(tenant.id)).resolves.toBe(tenant);

    expect(typeOrmRepo.findById).toHaveBeenCalledWith(tenant.id);
    expect(cachePort.set).toHaveBeenCalledWith(
      'platform:tenant:tenant-id-2',
      expect.objectContaining({
        id: tenant.id,
        slug: 'cache-miss',
        settings: tenant.settings.toJSON(),
      }),
      60_000,
    );
  });

  it('falls through to the repository when the cache backend fails', async () => {
    const tenant = new TenantBuilder().withId('tenant-id-4').withSlug('cache-error').build();
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    cachePort.get.mockRejectedValue(new Error('cache unavailable'));
    typeOrmRepo.findById.mockResolvedValue(tenant);

    await expect(repo.findById(tenant.id)).resolves.toBe(tenant);

    expect(typeOrmRepo.findById).toHaveBeenCalledWith(tenant.id);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cache read failed for platform:tenant:tenant-id-4'),
    );
    expect(cachePort.set).toHaveBeenCalledWith(
      'platform:tenant:tenant-id-4',
      expect.objectContaining({
        id: tenant.id,
        slug: 'cache-error',
        settings: tenant.settings.toJSON(),
      }),
      60_000,
    );

    warnSpy.mockRestore();
  });

  it('invalidates cached tenants after the transaction commits', async () => {
    const tenant = new TenantBuilder().withId('tenant-id-3').build();
    const mockDataSource = {
      transaction: jest.fn(async (fn: (em: EntityManager) => Promise<void>) => {
        const result = await fn({} as EntityManager);
        expect(cachePort.del).not.toHaveBeenCalled();
        return result;
      }),
    } as unknown as DataSource;
    const txManager = new TypeOrmTransactionManager(mockDataSource);

    await txManager.run(async () => {
      await repo.save(tenant);
      expect(cachePort.del).not.toHaveBeenCalled();
    });

    expect(typeOrmRepo.save).toHaveBeenCalledWith(tenant);
    expect(cachePort.del).toHaveBeenCalledWith('platform:tenant:tenant-id-3');
  });

  it('delegates read operations that are not cacheable', async () => {
    await repo.findBySlug('slug-a');
    await repo.findByIds(['id-a']);
    await repo.findMany({ slug: 'slug-a' });
    await repo.findAllActive();
    await repo.existsBySlug('slug-a');

    expect(typeOrmRepo.findBySlug).toHaveBeenCalledWith('slug-a');
    expect(typeOrmRepo.findByIds).toHaveBeenCalledWith(['id-a']);
    expect(typeOrmRepo.findMany).toHaveBeenCalledWith({ slug: 'slug-a' });
    expect(typeOrmRepo.findAllActive).toHaveBeenCalled();
    expect(typeOrmRepo.existsBySlug).toHaveBeenCalledWith('slug-a');
  });
});
