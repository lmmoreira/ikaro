import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  async save(config: HotsiteConfig): Promise<void> {
    const entity = this.toEntity(config);
    await this.repo.save(entity);
  }

  private toDomain(entity: HotsiteConfigEntity): HotsiteConfig {
    return HotsiteConfig.reconstitute({
      id: entity.id,
      tenantId: entity.tenantId,
      branding: entity.branding,
      layout: entity.layout,
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
    entity.isPublished = config.isPublished;
    entity.updatedAt = config.updatedAt;
    return entity;
  }
}
