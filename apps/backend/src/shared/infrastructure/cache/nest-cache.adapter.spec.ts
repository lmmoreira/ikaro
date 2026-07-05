import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test } from '@nestjs/testing';
import { NestCacheAdapter } from './nest-cache.adapter';

describe('NestCacheAdapter', () => {
  it('delegates cache operations to the cache manager', async () => {
    const cacheManager = {
      get: jest.fn().mockResolvedValue('cached-value'),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [NestCacheAdapter, { provide: CACHE_MANAGER, useValue: cacheManager }],
    }).compile();

    const adapter = moduleRef.get(NestCacheAdapter);

    await expect(adapter.get<string>('tenant:1')).resolves.toBe('cached-value');
    await expect(adapter.set('tenant:1', { id: 'tenant-1' }, 60_000)).resolves.toBeUndefined();
    await expect(adapter.del('tenant:1')).resolves.toBeUndefined();

    expect(cacheManager.get).toHaveBeenCalledWith('tenant:1');
    expect(cacheManager.set).toHaveBeenCalledWith('tenant:1', { id: 'tenant-1' }, 60_000);
    expect(cacheManager.del).toHaveBeenCalledWith('tenant:1');
  });
});
