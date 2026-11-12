import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { CACHE_PORT, type CachePort } from '../../../../shared/ports/cache.port';
import type { TenantAccessCacheInvalidator } from '../../application/ports/tenant-access-cache-invalidator.port';
import { tenantAccessCacheKey } from './tenant-access-cache-key';

/** Best-effort eviction: a failure is logged, never thrown (the TTL bounds the staleness). */
@Injectable()
export class TenantAccessCacheInvalidatorAdapter implements TenantAccessCacheInvalidator {
  private readonly logger = new AppLogger(TenantAccessCacheInvalidatorAdapter.name);

  constructor(@Inject(CACHE_PORT) private readonly cache: CachePort) {}

  async invalidate(tenantId: string): Promise<void> {
    try {
      await this.cache.del(tenantAccessCacheKey(tenantId));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Tenant access cache invalidation failed for '${tenantId}': ${message}`);
    }
  }
}
