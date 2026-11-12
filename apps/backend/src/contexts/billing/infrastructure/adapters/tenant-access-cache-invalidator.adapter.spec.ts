import { InMemoryCachePort } from '../../../../test/infrastructure/in-memory-cache.port';
import { tenantAccessCacheKey } from './tenant-access-cache-key';
import { TenantAccessCacheInvalidatorAdapter } from './tenant-access-cache-invalidator.adapter';

describe('TenantAccessCacheInvalidatorAdapter', () => {
  it('evicts the tenant access key', async () => {
    const cache = new InMemoryCachePort();
    await cache.set(tenantAccessCacheKey('t-1'), { operational: true });
    await cache.set(tenantAccessCacheKey('t-2'), { operational: true });

    await new TenantAccessCacheInvalidatorAdapter(cache).invalidate('t-1');

    expect(cache.has(tenantAccessCacheKey('t-1'))).toBe(false);
    expect(cache.has(tenantAccessCacheKey('t-2'))).toBe(true);
  });

  it('never throws when the cache fails (best-effort)', async () => {
    const cache = new InMemoryCachePort();
    cache.failNextDel(new Error('redis down'));

    await expect(
      new TenantAccessCacheInvalidatorAdapter(cache).invalidate('t-1'),
    ).resolves.toBeUndefined();
  });
});
