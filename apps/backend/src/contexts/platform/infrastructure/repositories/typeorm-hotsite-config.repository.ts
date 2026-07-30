import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { IHotsiteConfigRepository } from '../../application/ports/hotsite-config-repository.port';
import { HotsiteConfigConcurrentModificationError } from '../../domain/errors/platform-domain.error';
import { HotsiteConfig } from '../../domain/hotsite-config.aggregate';
import { HotsiteConfigEntity } from '../entities/hotsite-config.entity';

@Injectable()
export class TypeOrmHotsiteConfigRepository implements IHotsiteConfigRepository {
  constructor(
    @InjectRepository(HotsiteConfigEntity)
    private readonly repo: Repository<HotsiteConfigEntity>,
  ) {}

  async findByTenantId(tenantId: string): Promise<HotsiteConfig | null> {
    const entity = await this.repo.findOne({ where: { tenantId } });
    return entity ? this.toDomain(entity) : null;
  }

  async findByTenantIds(tenantIds: string[]): Promise<HotsiteConfig[]> {
    if (tenantIds.length === 0) return [];
    const entities = await this.repo.findBy({ tenantId: In(tenantIds) });
    return entities.map((e) => this.toDomain(e));
  }

  /**
   * Version-guarded — mirrors Booking's persistBooking (docs/ENGINEERING_RULES.md § TypeORM
   * optimistic locking on detached entities). `config` is a detached, hand-built aggregate;
   * `manager.save()` on it would silently overwrite whatever the DB currently holds regardless of
   * what this request actually read. Scoping the UPDATE to id + tenant_id + the version this
   * request loaded, and failing on affected !== 1, turns a lost update into a 409 the client can
   * react to instead of a silent last-write-wins.
   */
  async save(config: HotsiteConfig): Promise<void> {
    const entity = this.toEntity(config);
    const manager = getActiveEntityManager() ?? this.repo.manager;
    const nextVersion = config.version === undefined ? 1 : config.version + 1;

    if (config.version === undefined) {
      await manager.insert(HotsiteConfigEntity, entity);
    } else {
      const currentVersion = config.version;
      const result = await manager
        .createQueryBuilder()
        .update(HotsiteConfigEntity)
        .set(this.toUpdateSet(entity))
        .where('id = :id', { id: config.id })
        .andWhere('tenant_id = :tenantId', { tenantId: config.tenantId })
        .andWhere('version = :version', { version: currentVersion })
        .execute();

      if (result.affected !== 1) {
        throw new HotsiteConfigConcurrentModificationError();
      }
    }

    config.markPersisted(nextVersion);
  }

  private toUpdateSet(entity: HotsiteConfigEntity): QueryDeepPartialEntity<HotsiteConfigEntity> {
    const updatable = Object.fromEntries(
      Object.entries(entity).filter(
        ([key]) => !['id', 'tenantId', 'createdAt', 'version'].includes(key),
      ),
    ) as QueryDeepPartialEntity<HotsiteConfigEntity>;
    return { ...updatable, version: () => '"version" + 1' };
  }

  private toDomain(entity: HotsiteConfigEntity): HotsiteConfig {
    return HotsiteConfig.reconstitute({
      id: entity.id,
      tenantId: entity.tenantId,
      branding: entity.branding,
      layout: entity.layout,
      seo: entity.seo,
      isPublished: entity.isPublished,
      updatedAt: entity.updatedAt,
      version: entity.version,
    });
  }

  private toEntity(config: HotsiteConfig): HotsiteConfigEntity {
    const entity = new HotsiteConfigEntity();
    entity.id = config.id;
    entity.tenantId = config.tenantId;
    entity.branding = config.branding;
    entity.layout = config.layout;
    entity.seo = config.seo;
    entity.isPublished = config.isPublished;
    entity.updatedAt = config.updatedAt;
    if (config.version !== undefined) entity.version = config.version;
    return entity;
  }
}
