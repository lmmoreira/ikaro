import { TenantBuilder } from '../../../../test/builders/platform';
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

    cachePort.get.mockRejectedValue(new Error('cache unavailable'));
    typeOrmRepo.findById.mockResolvedValue(tenant);

    await expect(repo.findById(tenant.id)).resolves.toBe(tenant);

    expect(typeOrmRepo.findById).toHaveBeenCalledWith(tenant.id);
    expect(cachePort.set).toHaveBeenCalledWith(
      'platform:tenant:tenant-id-4',
      expect.objectContaining({
        id: tenant.id,
        slug: 'cache-error',
        settings: tenant.settings.toJSON(),
      }),
      60_000,
    );
  });

  it('invalidates cached tenants after save', async () => {
    const tenant = new TenantBuilder().withId('tenant-id-3').build();

    await repo.save(tenant);

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
