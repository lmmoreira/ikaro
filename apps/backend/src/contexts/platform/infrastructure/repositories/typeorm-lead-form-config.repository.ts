import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { ILeadFormConfigRepository } from '../../application/ports/lead-form-config-repository.port';
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

  async save(config: LeadFormConfig): Promise<void> {
    const manager = getActiveEntityManager();
    const entity = this.toEntity(config);
    const conflictPaths: (keyof LeadFormConfigEntity)[] = ['tenantId'];
    if (manager) {
      await manager.upsert(LeadFormConfigEntity, entity, conflictPaths);
    } else {
      await this.repo.upsert(entity, conflictPaths);
    }
  }

  private toDomain(entity: LeadFormConfigEntity): LeadFormConfig {
    return LeadFormConfig.reconstitute({
      tenantId: entity.tenantId,
      audienceMode: entity.audienceMode,
      questions: entity.questions,
      updatedAt: entity.updatedAt,
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
