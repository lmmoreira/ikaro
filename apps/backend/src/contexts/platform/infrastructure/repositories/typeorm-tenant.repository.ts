import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Cache } from 'cache-manager';
import { In, QueryFailedError, Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { Slug } from '../../../../shared/value-objects/slug.vo';
import { SlugAlreadyTakenError } from '../../domain/errors/platform-domain.error';
import { ITenantRepository, TenantFilters } from '../../application/ports/tenant-repository.port';
import { Tenant } from '../../domain/tenant.aggregate';
import { TenantSettings } from '../../domain/value-objects/tenant-settings.vo';
import { TenantEntity } from '../entities/tenant.entity';

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
export class TypeOrmTenantRepository implements ITenantRepository {
  private static readonly CACHE_TTL_MS = 60_000;
  private static readonly CACHE_KEY_PREFIX = 'platform:tenant:';

  constructor(
    @InjectRepository(TenantEntity)
    private readonly repo: Repository<TenantEntity>,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  async findBySlug(slug: string): Promise<Tenant | null> {
    const entity = await this.repo.findOne({ where: { slug } });
    return entity ? this.toDomain(entity) : null;
  }

  async findById(id: string): Promise<Tenant | null> {
    const cachedTenant = await this.readCache(id);
    if (cachedTenant) {
      return this.toDomain(cachedTenant);
    }

    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) return null;

    const cachedRecord = this.toCacheRecord(entity);
    await this.writeCache(cachedRecord);
    return this.toDomain(cachedRecord);
  }

  async save(tenant: Tenant): Promise<void> {
    const entity = this.toEntity(tenant);
    const manager = getActiveEntityManager();
    try {
      if (manager) {
        await manager.save(TenantEntity, entity);
      } else {
        await this.repo.save(entity);
      }
      await this.invalidateCache(tenant.id);
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err as QueryFailedError & { code: string }).code === '23505'
      ) {
        throw new SlugAlreadyTakenError(tenant.slug.value);
      }
      throw err;
    }
  }

  async findByIds(ids: string[]): Promise<Tenant[]> {
    if (ids.length === 0) return [];
    const entities = await this.repo.findBy({ id: In(ids) });
    return entities.map((e) => this.toDomain(e));
  }

  async findMany(filters: TenantFilters = {}): Promise<Tenant[]> {
    if (filters.ids?.length === 0) return [];
    const query = this.repo.createQueryBuilder('tenant').orderBy('tenant.createdAt', 'ASC');

    if (filters.ids) query.andWhere('tenant.id IN (:...ids)', { ids: filters.ids });
    if (filters.status === 'ACTIVE')
      query.andWhere('tenant.isActive = :isActive', { isActive: true });
    if (filters.status === 'INACTIVE') {
      query.andWhere('tenant.isActive = :isActive', { isActive: false });
    }
    if (filters.name) query.andWhere('tenant.name ILIKE :name', { name: `%${filters.name}%` });
    if (filters.slug) query.andWhere('tenant.slug = :slug', { slug: filters.slug });
    if (filters.limit !== undefined) query.take(filters.limit);
    if (filters.offset !== undefined) query.skip(filters.offset);

    const entities = await query.getMany();
    return entities.map((e) => this.toDomain(e));
  }

  async findAllActive(): Promise<Tenant[]> {
    const entities = await this.repo.findBy({ isActive: true });
    return entities.map((e) => this.toDomain(e));
  }

  async existsBySlug(slug: string): Promise<boolean> {
    return this.repo.existsBy({ slug });
  }

  private toDomain(entity: TenantEntity | TenantCacheRecord): Tenant {
    return Tenant.reconstitute({
      id: entity.id,
      name: entity.name,
      slug: Slug.create(entity.slug),
      settings: TenantSettings.reconstitute(entity.settings),
      isActive: entity.isActive,
      createdAt: this.toDate(entity.createdAt),
      updatedAt: this.toDate(entity.updatedAt),
    });
  }

  private toCacheRecord(entity: TenantEntity): TenantCacheRecord {
    return {
      id: entity.id,
      name: entity.name,
      slug: entity.slug,
      settings: entity.settings,
      isActive: entity.isActive,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  private cacheKey(tenantId: string): string {
    return `${TypeOrmTenantRepository.CACHE_KEY_PREFIX}${tenantId}`;
  }

  private toDate(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value);
  }

  private async readCache(tenantId: string): Promise<TenantCacheRecord | null> {
    try {
      return (await this.cacheManager.get<TenantCacheRecord>(this.cacheKey(tenantId))) ?? null;
    } catch {
      return null;
    }
  }

  private async writeCache(record: TenantCacheRecord): Promise<void> {
    try {
      await this.cacheManager.set(
        this.cacheKey(record.id),
        record,
        TypeOrmTenantRepository.CACHE_TTL_MS,
      );
    } catch {
      // Cache is best-effort. A cache failure must not block tenant reads.
    }
  }

  private async invalidateCache(tenantId: string): Promise<void> {
    try {
      await this.cacheManager.del(this.cacheKey(tenantId));
    } catch {
      // Cache is best-effort. A cache failure must not block tenant writes.
    }
  }

  private toEntity(tenant: Tenant): TenantEntity {
    const entity = new TenantEntity();
    entity.id = tenant.id;
    entity.name = tenant.name;
    entity.slug = tenant.slug.value;
    entity.settings = tenant.settings.toJSON();
    entity.isActive = tenant.isActive;
    entity.createdAt = tenant.createdAt;
    entity.updatedAt = tenant.updatedAt;
    return entity;
  }
}
