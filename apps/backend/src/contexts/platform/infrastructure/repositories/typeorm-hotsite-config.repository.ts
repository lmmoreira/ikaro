import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { IHotsiteConfigRepository } from '../../application/ports/hotsite-config-repository.port';
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

  async save(config: HotsiteConfig): Promise<void> {
    const entity = this.toEntity(config);
    const manager = getActiveEntityManager();
    if (manager) {
      await manager.save(HotsiteConfigEntity, entity);
    } else {
      await this.repo.save(entity);
    }
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
    return entity;
  }
}
