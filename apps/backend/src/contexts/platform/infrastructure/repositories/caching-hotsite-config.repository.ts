import { Inject, Injectable } from '@nestjs/common';
import { CACHE_PORT, CachePort } from '../../../../shared/ports/cache.port';
import { scheduleAfterCommit } from '../../../../shared/infrastructure/transaction-context';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { IHotsiteConfigRepository } from '../../application/ports/hotsite-config-repository.port';
import { HotsiteConfig, HotsiteModuleType } from '../../domain/hotsite-config.aggregate';
import { TypeOrmHotsiteConfigRepository } from './typeorm-hotsite-config.repository';

type ModuleEnabledMap = Partial<Record<HotsiteModuleType, boolean>>;

// Mirrors CachingTenantRepository's shape (docs/ENGINEERING_RULES.md § Platform tenant cache) —
// but deliberately caches only the derived module-enabled map, not the full HotsiteConfig
// aggregate. findByTenantId/findByTenantIds stay uncached pass-throughs: the admin editor
// (HotsiteContentReader) and the public manifest both need those fully fresh, and the aggregate's
// richer shape (branding VOs, per-module-type data) isn't worth the reconstitution risk for what
// nav-gating reads (GET /tenants/lead-form/status, polled once per dashboard page load) actually
// need — one boolean per module type (M20-S10 follow-up).
@Injectable()
export class CachingHotsiteConfigRepository implements IHotsiteConfigRepository {
  private static readonly CACHE_TTL_MS = 60_000;
  private static readonly CACHE_KEY_PREFIX = 'platform:hotsite-config:modules-enabled:';
  private readonly logger = new AppLogger(CachingHotsiteConfigRepository.name);

  constructor(
    @Inject(TypeOrmHotsiteConfigRepository) private readonly repo: IHotsiteConfigRepository,
    @Inject(CACHE_PORT) private readonly cache: CachePort,
  ) {}

  async findByTenantId(tenantId: string): Promise<HotsiteConfig | null> {
    return this.repo.findByTenantId(tenantId);
  }

  async findByTenantIds(tenantIds: string[]): Promise<HotsiteConfig[]> {
    return this.repo.findByTenantIds(tenantIds);
  }

  async save(config: HotsiteConfig): Promise<void> {
    await this.repo.save(config);
    await scheduleAfterCommit(() => this.invalidateCache(config.tenantId));
  }

  async isModuleEnabled(tenantId: string, moduleType: HotsiteModuleType): Promise<boolean | null> {
    const cached = await this.readCache(tenantId);
    if (cached && moduleType in cached) {
      return cached[moduleType] ?? false;
    }

    const config = await this.repo.findByTenantId(tenantId);
    if (!config) return null;

    const map: ModuleEnabledMap = {};
    for (const module of config.layout) {
      map[module.type] = module.enabled;
    }
    await this.writeCache(tenantId, map);
    return map[moduleType] ?? false;
  }

  private cacheKey(tenantId: string): string {
    return `${CachingHotsiteConfigRepository.CACHE_KEY_PREFIX}${tenantId}`;
  }

  private async readCache(tenantId: string): Promise<ModuleEnabledMap | null> {
    try {
      return (await this.cache.get<ModuleEnabledMap>(this.cacheKey(tenantId))) ?? null;
    } catch (err) {
      this.logger.warn(
        `Cache read failed for ${this.cacheKey(tenantId)}: ${this.describeCacheError(err)}`,
      );
      return null;
    }
  }

  private async writeCache(tenantId: string, map: ModuleEnabledMap): Promise<void> {
    try {
      await this.cache.set(
        this.cacheKey(tenantId),
        map,
        CachingHotsiteConfigRepository.CACHE_TTL_MS,
      );
    } catch (err) {
      this.logger.warn(
        `Cache write failed for ${this.cacheKey(tenantId)}: ${this.describeCacheError(err)}`,
      );
    }
  }

  private async invalidateCache(tenantId: string): Promise<void> {
    try {
      await this.cache.del(this.cacheKey(tenantId));
    } catch (err) {
      this.logger.warn(
        `Cache invalidation failed for ${this.cacheKey(tenantId)}: ${this.describeCacheError(err)}`,
      );
    }
  }

  private describeCacheError(err: unknown): string {
    if (err instanceof Error) {
      return err.message;
    }

    return String(err);
  }
}
