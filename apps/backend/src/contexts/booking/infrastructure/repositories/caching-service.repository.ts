import { Inject, Injectable } from '@nestjs/common';
import { CACHE_PORT, CachePort } from '../../../../shared/ports/cache.port';
import { scheduleAfterCommit } from '../../../../shared/infrastructure/transaction-context';
import { Money } from '../../../../shared/value-objects/money';
import { toDate } from '../../../../shared/utils/date';
import {
  IServiceRepository,
  ServiceFilters,
  ServiceStatusFilter,
} from '../../application/ports/service-repository.port';
import { Service } from '../../domain/service.aggregate';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { TypeOrmServiceRepository } from './typeorm-service.repository';

type ServiceCacheRecord = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  priceAmount: string;
  priceCurrency: string;
  durationMinutes: number;
  loyaltyPointsValue: number;
  requiresPickupAddress: boolean;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
};

const CACHEABLE_STATUSES: ServiceStatusFilter[] = ['ACTIVE', 'INACTIVE', 'ANY'];

@Injectable()
export class CachingServiceRepository implements IServiceRepository {
  private static readonly CACHE_TTL_MS = 60_000;
  // v2: cache records now carry their own priceCurrency (PR #373 review, Codex) instead of
  // re-deriving it from live tenant settings on every cache hit — bumped so no v1 entry (lacking
  // priceCurrency) is ever read back with an undefined currency during the rollout.
  private static readonly CACHE_KEY_PREFIX = 'booking:service:v2:';
  private readonly logger = new AppLogger(CachingServiceRepository.name);

  constructor(
    // Explicit @Inject(TypeOrmServiceRepository) — required now that the parameter's static type
    // is the IServiceRepository interface: interfaces are erased at runtime, so Nest's constructor
    // reflection alone can't infer a token from an interface-typed parameter (PR #373 review,
    // Codex — the concrete class stays the real DI token; the interface type only widens what a
    // test can substitute here, e.g. InMemoryServiceRepository).
    @Inject(TypeOrmServiceRepository) private readonly repo: IServiceRepository,
    @Inject(CACHE_PORT) private readonly cache: CachePort,
  ) {}

  async findById(id: string, tenantId: string): Promise<Service | null> {
    return this.repo.findById(id, tenantId);
  }

  async findByIds(ids: string[], tenantId: string): Promise<Service[]> {
    return this.repo.findByIds(ids, tenantId);
  }

  // Only the unfiltered, status-only shape is cached — the exact call every real hot-path caller
  // makes (public hotsite/chatbot: status 'ACTIVE'; staff dashboard list: status 'ANY'). Same
  // selective scope CachingTenantRepository already uses (caches findById only, bypasses
  // findMany/filtered reads) — a search or specific `ids` filter always bypasses the cache and
  // hits Postgres directly, never cached.
  async findAllByTenant(tenantId: string, filters: ServiceFilters = {}): Promise<Service[]> {
    const cacheKey = this.cacheableKey(tenantId, filters);
    if (!cacheKey) {
      return this.repo.findAllByTenant(tenantId, filters);
    }

    const cached = await this.readCache(cacheKey);
    if (cached) {
      return cached.map((record) => this.toDomain(record));
    }

    const services = await this.repo.findAllByTenant(tenantId, filters);
    await this.writeCache(
      cacheKey,
      services.map((service) => this.toCacheRecord(service)),
    );
    return services;
  }

  async save(service: Service): Promise<void> {
    await this.repo.save(service);
    await scheduleAfterCommit(() => this.invalidateCache(service.tenantId));
  }

  private cacheableKey(tenantId: string, filters: ServiceFilters): string | null {
    if (filters.ids?.length || filters.search || !filters.status) return null;
    return this.cacheKey(tenantId, filters.status);
  }

  private cacheKey(tenantId: string, status: ServiceStatusFilter): string {
    return `${CachingServiceRepository.CACHE_KEY_PREFIX}${tenantId}:${status}`;
  }

  private async readCache(key: string): Promise<ServiceCacheRecord[] | null> {
    try {
      return (await this.cache.get<ServiceCacheRecord[]>(key)) ?? null;
    } catch (err) {
      this.logger.warn(`Cache read failed for ${key}: ${this.describeCacheError(err)}`);
      return null;
    }
  }

  private async writeCache(key: string, records: ServiceCacheRecord[]): Promise<void> {
    try {
      await this.cache.set(key, records, CachingServiceRepository.CACHE_TTL_MS);
    } catch (err) {
      this.logger.warn(`Cache write failed for ${key}: ${this.describeCacheError(err)}`);
    }
  }

  private async invalidateCache(tenantId: string): Promise<void> {
    try {
      await Promise.all(
        CACHEABLE_STATUSES.map((status) => this.cache.del(this.cacheKey(tenantId, status))),
      );
    } catch (err) {
      this.logger.warn(
        `Cache invalidation failed for tenant ${tenantId}: ${this.describeCacheError(err)}`,
      );
    }
  }

  private describeCacheError(err: unknown): string {
    if (err instanceof Error) {
      return err.message;
    }

    return String(err);
  }

  private toDomain(record: ServiceCacheRecord): Service {
    return Service.reconstitute({
      id: record.id,
      tenantId: record.tenantId,
      name: record.name,
      description: record.description,
      price: Money.from(record.priceAmount, record.priceCurrency),
      durationMinutes: record.durationMinutes,
      loyaltyPointsValue: record.loyaltyPointsValue,
      requiresPickupAddress: record.requiresPickupAddress,
      isActive: record.isActive,
      createdAt: toDate(record.createdAt),
      updatedAt: toDate(record.updatedAt),
    });
  }

  private toCacheRecord(service: Service): ServiceCacheRecord {
    return {
      id: service.id,
      tenantId: service.tenantId,
      name: service.name,
      description: service.description,
      priceAmount: service.price.amount.toFixed(2),
      priceCurrency: service.price.currency,
      durationMinutes: service.durationMinutes,
      loyaltyPointsValue: service.loyaltyPointsValue,
      requiresPickupAddress: service.requiresPickupAddress,
      isActive: service.isActive,
      createdAt: service.createdAt,
      updatedAt: service.updatedAt,
    };
  }
}
