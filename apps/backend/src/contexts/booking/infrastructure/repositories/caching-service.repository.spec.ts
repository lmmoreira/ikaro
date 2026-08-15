import { DataSource, EntityManager } from 'typeorm';
import { ServiceBuilder } from '../../../../test/builders/booking';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { ITenantSettingsPort } from '../../../../shared/ports/tenant-settings.port';
import { TypeOrmServiceRepository } from './typeorm-service.repository';
import { CachingServiceRepository } from './caching-service.repository';

describe('CachingServiceRepository', () => {
  let typeOrmRepo: jest.Mocked<TypeOrmServiceRepository>;
  let cachePort: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
  };
  let settingsPort: jest.Mocked<ITenantSettingsPort>;
  let repo: CachingServiceRepository;

  beforeEach(() => {
    typeOrmRepo = {
      findById: jest.fn(),
      findByIds: jest.fn(),
      findAllByTenant: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<TypeOrmServiceRepository>;

    cachePort = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    settingsPort = {
      getSettings: jest.fn().mockResolvedValue({ localization: { currency: 'BRL' } }),
    } as unknown as jest.Mocked<ITenantSettingsPort>;

    repo = new CachingServiceRepository(typeOrmRepo, cachePort as never, settingsPort);
  });

  it('uses the cache for an unfiltered, status-only findAllByTenant call', async () => {
    const service = new ServiceBuilder()
      .withTenantId('tenant-1')
      .withName('Cached Service')
      .build();

    cachePort.get.mockResolvedValue([
      {
        id: service.id,
        tenantId: service.tenantId,
        name: service.name,
        description: service.description,
        priceAmount: service.price.amount.toFixed(2),
        durationMinutes: service.durationMinutes,
        loyaltyPointsValue: service.loyaltyPointsValue,
        requiresPickupAddress: service.requiresPickupAddress,
        isActive: service.isActive,
        createdAt: service.createdAt.toISOString(),
        updatedAt: service.updatedAt.toISOString(),
      },
    ]);

    const result = await repo.findAllByTenant('tenant-1', { status: 'ACTIVE' });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: service.id, name: 'Cached Service' });
    expect(cachePort.get).toHaveBeenCalledWith('booking:service:tenant-1:ACTIVE');
    expect(typeOrmRepo.findAllByTenant).not.toHaveBeenCalled();
  });

  it('falls through to the repository and warms the cache on a miss', async () => {
    const service = new ServiceBuilder().withTenantId('tenant-2').build();
    cachePort.get.mockResolvedValue(null);
    typeOrmRepo.findAllByTenant.mockResolvedValue([service]);

    const result = await repo.findAllByTenant('tenant-2', { status: 'ANY' });

    expect(result).toEqual([service]);
    expect(typeOrmRepo.findAllByTenant).toHaveBeenCalledWith('tenant-2', { status: 'ANY' });
    expect(cachePort.set).toHaveBeenCalledWith(
      'booking:service:tenant-2:ANY',
      [expect.objectContaining({ id: service.id, priceAmount: service.price.amount.toFixed(2) })],
      60_000,
    );
  });

  it('falls through to the repository when the cache backend fails', async () => {
    const service = new ServiceBuilder().withTenantId('tenant-3').build();
    const warnSpy = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
    cachePort.get.mockRejectedValue(new Error('cache unavailable'));
    typeOrmRepo.findAllByTenant.mockResolvedValue([service]);

    const result = await repo.findAllByTenant('tenant-3', { status: 'ACTIVE' });

    expect(result).toEqual([service]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cache read failed for booking:service:tenant-3:ACTIVE'),
    );

    warnSpy.mockRestore();
  });

  it('still returns the fetched services when the cache write fails', async () => {
    const service = new ServiceBuilder().withTenantId('tenant-write-fail').build();
    const warnSpy = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
    cachePort.get.mockResolvedValue(null);
    cachePort.set.mockRejectedValue('not an Error instance');
    typeOrmRepo.findAllByTenant.mockResolvedValue([service]);

    const result = await repo.findAllByTenant('tenant-write-fail', { status: 'ACTIVE' });

    expect(result).toEqual([service]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Cache write failed for booking:service:tenant-write-fail:ACTIVE: not an Error instance',
      ),
    );

    warnSpy.mockRestore();
  });

  it('bypasses the cache entirely when a search filter is present', async () => {
    typeOrmRepo.findAllByTenant.mockResolvedValue([]);

    await repo.findAllByTenant('tenant-4', { status: 'ACTIVE', search: 'lavagem' });

    expect(cachePort.get).not.toHaveBeenCalled();
    expect(cachePort.set).not.toHaveBeenCalled();
    expect(typeOrmRepo.findAllByTenant).toHaveBeenCalledWith('tenant-4', {
      status: 'ACTIVE',
      search: 'lavagem',
    });
  });

  it('bypasses the cache entirely when an ids filter is present', async () => {
    typeOrmRepo.findAllByTenant.mockResolvedValue([]);

    await repo.findAllByTenant('tenant-5', { ids: ['a', 'b'] });

    expect(cachePort.get).not.toHaveBeenCalled();
    expect(cachePort.set).not.toHaveBeenCalled();
  });

  it('bypasses the cache entirely when no status filter is given', async () => {
    typeOrmRepo.findAllByTenant.mockResolvedValue([]);

    await repo.findAllByTenant('tenant-6');

    expect(cachePort.get).not.toHaveBeenCalled();
    expect(cachePort.set).not.toHaveBeenCalled();
  });

  it('findById and findByIds always delegate straight through, bypassing the cache', async () => {
    const service = new ServiceBuilder().build();
    typeOrmRepo.findById.mockResolvedValue(service);
    typeOrmRepo.findByIds.mockResolvedValue([service]);

    await expect(repo.findById(service.id, service.tenantId)).resolves.toBe(service);
    await expect(repo.findByIds([service.id], service.tenantId)).resolves.toEqual([service]);

    expect(cachePort.get).not.toHaveBeenCalled();
    expect(cachePort.set).not.toHaveBeenCalled();
  });

  it('invalidates all 3 status-keyed cache entries for the tenant after the transaction commits', async () => {
    const service = new ServiceBuilder().withTenantId('tenant-7').build();
    const mockDataSource = {
      transaction: jest.fn(async (fn: (em: EntityManager) => Promise<void>) => {
        const result = await fn({} as EntityManager);
        expect(cachePort.del).not.toHaveBeenCalled();
        return result;
      }),
    } as unknown as DataSource;
    const txManager = new TypeOrmTransactionManager(mockDataSource);

    await txManager.run(async () => {
      await repo.save(service);
      expect(cachePort.del).not.toHaveBeenCalled();
    });

    expect(typeOrmRepo.save).toHaveBeenCalledWith(service);
    expect(cachePort.del).toHaveBeenCalledWith('booking:service:tenant-7:ACTIVE');
    expect(cachePort.del).toHaveBeenCalledWith('booking:service:tenant-7:INACTIVE');
    expect(cachePort.del).toHaveBeenCalledWith('booking:service:tenant-7:ANY');
  });

  it('does not throw when cache invalidation fails after save', async () => {
    const service = new ServiceBuilder().withTenantId('tenant-8').build();
    const warnSpy = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
    cachePort.del.mockRejectedValue(new Error('cache unavailable'));
    const mockDataSource = {
      transaction: jest.fn(async (fn: (em: EntityManager) => Promise<void>) =>
        fn({} as EntityManager),
      ),
    } as unknown as DataSource;
    const txManager = new TypeOrmTransactionManager(mockDataSource);

    await expect(txManager.run(() => repo.save(service))).resolves.not.toThrow();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cache invalidation failed for tenant tenant-8: cache unavailable'),
    );

    warnSpy.mockRestore();
  });
});
