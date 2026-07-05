import { CacheModule } from '@nestjs/cache-manager';

export const TEST_CACHE_TTL_MS = 60_000;

export function testCacheModule() {
  return CacheModule.register({
    isGlobal: true,
    ttl: TEST_CACHE_TTL_MS,
  });
}
