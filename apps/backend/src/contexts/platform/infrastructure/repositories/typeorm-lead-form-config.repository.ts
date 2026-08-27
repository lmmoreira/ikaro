import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { ILeadFormConfigRepository } from '../../application/ports/lead-form-config-repository.port';
import { LeadFormConfigConcurrentModificationError } from '../../domain/errors/platform-domain.error';
import { LeadFormConfig } from '../../domain/lead-form-config.aggregate';
import { LeadFormConfigEntity } from '../entities/lead-form-config.entity';

@Injectable()
export class TypeOrmLeadFormConfigRepository implements ILeadFormConfigRepository {
  constructor(
    @InjectRepository(LeadFormConfigEntity)
    private readonly repo: Repository<LeadFormConfigEntity>,
  ) {}

  async findByTenantId(tenantId: string): Promise<LeadFormConfig | null> {
    const entity = await this.repo.findOne({ where: { tenantId } });
    return entity ? this.toDomain(entity) : null;
  }

  /**
   * Version-guarded — mirrors TypeOrmHotsiteConfigRepository.save() (docs/ENGINEERING_RULES.md §
   * TypeORM optimistic locking on detached entities), the sibling aggregate this use case writes
   * in the same transaction. `config` is a detached, hand-built aggregate; a blind upsert() (the
   * previous implementation) would silently overwrite whatever the DB currently holds regardless
   * of what this request actually read — the exact gap Codex review caught, PR #429, 2026-08-26.
   * Scoping the UPDATE to tenant_id + the version this request loaded, and failing on
   * affected !== 1, turns a lost update into a 409 the client can react to.
   */
  async save(config: LeadFormConfig): Promise<void> {
    const entity = this.toEntity(config);
    const manager = getActiveEntityManager() ?? this.repo.manager;
    const nextVersion = config.version === undefined ? 1 : config.version + 1;

    if (config.version === undefined) {
      await manager.insert(LeadFormConfigEntity, entity);
    } else {
      const currentVersion = config.version;
      const result = await manager
        .createQueryBuilder()
        .update(LeadFormConfigEntity)
        .set(this.toUpdateSet(entity))
        .where('tenant_id = :tenantId', { tenantId: config.tenantId })
        .andWhere('version = :version', { version: currentVersion })
        .execute();

      if (result.affected !== 1) {
        throw new LeadFormConfigConcurrentModificationError();
      }
    }

    config.markPersisted(nextVersion);
  }

  private toUpdateSet(entity: LeadFormConfigEntity): QueryDeepPartialEntity<LeadFormConfigEntity> {
    const updatable = Object.fromEntries(
      Object.entries(entity).filter(([key]) => !['tenantId', 'version'].includes(key)),
    ) as QueryDeepPartialEntity<LeadFormConfigEntity>;
    return { ...updatable, version: () => '"version" + 1' };
  }

  private toDomain(entity: LeadFormConfigEntity): LeadFormConfig {
    return LeadFormConfig.reconstitute({
      tenantId: entity.tenantId,
      audienceMode: entity.audienceMode,
      questions: entity.questions,
      updatedAt: entity.updatedAt,
      version: entity.version,
    });
  }

  private toEntity(config: LeadFormConfig): LeadFormConfigEntity {
    const entity = new LeadFormConfigEntity();
    entity.tenantId = config.tenantId;
    entity.audienceMode = config.audienceMode;
    entity.questions = config.questions;
    entity.updatedAt = config.updatedAt;
    return entity;
  }
}
