import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_PORT, CachePort } from '../../../../shared/ports/cache.port';
import { scheduleAfterCommit } from '../../../../shared/infrastructure/transaction-context';
import { toDate } from '../../../../shared/utils/date';
import { Slug } from '../../../../shared/value-objects/slug.vo';
import { ITenantRepository, TenantFilters } from '../../application/ports/tenant-repository.port';
import { Tenant } from '../../domain/tenant.aggregate';
import { TenantSettings } from '../../domain/value-objects/tenant-settings.vo';
import { TypeOrmTenantRepository } from './typeorm-tenant.repository';

type TenantCacheRecord = {
  id: string;
  name: string;
  slug: string;
  settings: ReturnType<TenantSettings['toJSON']>;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
};

@Injectable()
export class CachingTenantRepository implements ITenantRepository {
  private static readonly CACHE_TTL_MS = 60_000;
  private static readonly CACHE_KEY_PREFIX = 'platform:tenant:';
  private readonly logger = new Logger(CachingTenantRepository.name);

  constructor(
    private readonly repo: TypeOrmTenantRepository,
    @Inject(CACHE_PORT) private readonly cache: CachePort,
  ) {}

  async findBySlug(slug: string): Promise<Tenant | null> {
    return this.repo.findBySlug(slug);
  }

  async findById(id: string): Promise<Tenant | null> {
    const cachedTenant = await this.readCache(id);
    if (cachedTenant) {
      return this.toDomain(cachedTenant);
    }

    const tenant = await this.repo.findById(id);
    if (!tenant) return null;

    await this.writeCache(this.toCacheRecord(tenant));
    return tenant;
  }

  async findByIds(ids: string[]): Promise<Tenant[]> {
    return this.repo.findByIds(ids);
  }

  async findMany(filters: TenantFilters = {}): Promise<Tenant[]> {
    return this.repo.findMany(filters);
  }

  async findAllActive(): Promise<Tenant[]> {
    return this.repo.findAllActive();
  }

  async save(tenant: Tenant): Promise<void> {
    await this.repo.save(tenant);
    await scheduleAfterCommit(() => this.invalidateCache(tenant.id));
  }

  async existsBySlug(slug: string): Promise<boolean> {
    return this.repo.existsBySlug(slug);
  }

  private cacheKey(tenantId: string): string {
    return `${CachingTenantRepository.CACHE_KEY_PREFIX}${tenantId}`;
  }

  private async readCache(tenantId: string): Promise<TenantCacheRecord | null> {
    try {
      return (await this.cache.get<TenantCacheRecord>(this.cacheKey(tenantId))) ?? null;
    } catch (err) {
      this.logger.warn(
        `Cache read failed for ${this.cacheKey(tenantId)}: ${this.describeCacheError(err)}`,
      );
      return null;
    }
  }

  private async writeCache(record: TenantCacheRecord): Promise<void> {
    try {
      await this.cache.set(this.cacheKey(record.id), record, CachingTenantRepository.CACHE_TTL_MS);
    } catch (err) {
      this.logger.warn(
        `Cache write failed for ${this.cacheKey(record.id)}: ${this.describeCacheError(err)}`,
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

  private toDomain(entity: TenantCacheRecord): Tenant {
    return Tenant.reconstitute({
      id: entity.id,
      name: entity.name,
      slug: Slug.create(entity.slug),
      settings: TenantSettings.reconstitute(entity.settings),
      isActive: entity.isActive,
      createdAt: toDate(entity.createdAt),
      updatedAt: toDate(entity.updatedAt),
    });
  }

  private toCacheRecord(tenant: Tenant): TenantCacheRecord {
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug.value,
      settings: tenant.settings.toJSON(),
      isActive: tenant.isActive,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };
  }
}
