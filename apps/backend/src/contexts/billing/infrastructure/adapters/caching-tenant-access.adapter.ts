import { Inject, Injectable } from '@nestjs/common';
import type { FeatureKey } from '@ikaro/validation';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { CACHE_PORT, type CachePort } from '../../../../shared/ports/cache.port';
import type { TenantAccess, TenantAccessPort } from '../../../../shared/ports/tenant-access.port';
import { GetTenantAccessUseCase } from '../../application/use-cases/get-tenant-access.use-case';
import { ListSuspendedTenantIdsUseCase } from '../../application/use-cases/list-suspended-tenant-ids.use-case';
import { ListTenantIdsNotEntitledToUseCase } from '../../application/use-cases/list-tenant-ids-not-entitled-to.use-case';
import { tenantAccessCacheKey } from './tenant-access-cache-key';

/**
 * Billing's `TenantAccessPort`: the access use case behind a cache with asymmetric TTLs, so a
 * paying tenant comes back fast after a suspension is lifted. The fail-open answer (`degraded`) is
 * never cached, so one transient blip cannot hold the door open for a minute. A provisional
 * (within-window) answer is cached like any operational one, so the 15-minute grace can run up to
 * one TTL (60 s) longer; that bound is accepted and stated in UC-120 A1. The cache is
 * best-effort: a failing read or write falls through to the use case.
 */
@Injectable()
export class CachingTenantAccessAdapter implements TenantAccessPort {
  static readonly OPERATIONAL_TTL_MS = 60_000;
  static readonly SUSPENDED_TTL_MS = 10_000;

  private readonly logger = new AppLogger(CachingTenantAccessAdapter.name);

  constructor(
    private readonly getTenantAccess: GetTenantAccessUseCase,
    private readonly listSuspended: ListSuspendedTenantIdsUseCase,
    private readonly listNotEntitled: ListTenantIdsNotEntitledToUseCase,
    @Inject(CACHE_PORT) private readonly cache: CachePort,
  ) {}

  async getAccess(tenantId: string): Promise<TenantAccess> {
    const key = tenantAccessCacheKey(tenantId);
    const cached = await this.readCache(key);
    if (cached) return cached;

    const access = await this.getTenantAccess.execute({ tenantId });
    if (!access.degraded) {
      await this.writeCache(key, access);
    }
    return access;
  }

  async listSuspendedTenantIds(): Promise<string[]> {
    return (await this.listSuspended.execute()).tenantIds;
  }

  async findTenantIdsNotEntitledTo(feature: FeatureKey): Promise<string[]> {
    return (await this.listNotEntitled.execute({ feature })).tenantIds;
  }

  private async readCache(key: string): Promise<TenantAccess | null> {
    try {
      return (await this.cache.get<TenantAccess>(key)) ?? null;
    } catch (err: unknown) {
      this.logger.warn(`Tenant access cache read failed: ${describe(err)}`);
      return null;
    }
  }

  private async writeCache(key: string, access: TenantAccess): Promise<void> {
    const ttl = access.operational
      ? CachingTenantAccessAdapter.OPERATIONAL_TTL_MS
      : CachingTenantAccessAdapter.SUSPENDED_TTL_MS;
    try {
      await this.cache.set(key, access, ttl);
    } catch (err: unknown) {
      this.logger.warn(`Tenant access cache write failed: ${describe(err)}`);
    }
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
