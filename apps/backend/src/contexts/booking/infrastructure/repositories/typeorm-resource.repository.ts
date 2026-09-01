import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import {
  IResourceRepository,
  ListResourcesFilter,
} from '../../application/ports/resource-repository.port';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceEntity } from '../entities/resource.entity';

@Injectable()
export class TypeOrmResourceRepository implements IResourceRepository {
  constructor(
    @InjectRepository(ResourceEntity)
    private readonly repo: Repository<ResourceEntity>,
  ) {}

  async findByTenant(tenantId: string, filter: ListResourcesFilter): Promise<Resource[]> {
    const entities = await this.repo.find({
      where: {
        tenantId,
        ...(filter.type !== undefined ? { type: filter.type } : {}),
        ...(filter.isActive !== undefined ? { isActive: filter.isActive } : {}),
      },
      order: { type: 'ASC', name: 'ASC' },
    });
    return entities.map((e) => this.toDomain(e));
  }

  async findById(id: string, tenantId: string): Promise<Resource | null> {
    const entity = await this.repo.findOne({ where: { id, tenantId } });
    return entity ? this.toDomain(entity) : null;
  }

  async findByRefId(refId: string, tenantId: string): Promise<Resource | null> {
    const entity = await this.repo.findOne({ where: { refId, tenantId } });
    return entity ? this.toDomain(entity) : null;
  }

  async save(resource: Resource): Promise<void> {
    const entity = this.toEntity(resource);
    const manager = getActiveEntityManager();
    if (manager) {
      await manager.save(ResourceEntity, entity);
    } else {
      await this.repo.save(entity);
    }
  }

  private toDomain(entity: ResourceEntity): Resource {
    return Resource.reconstitute({
      id: entity.id,
      tenantId: entity.tenantId,
      type: entity.type,
      refId: entity.refId,
      name: entity.name,
      workingHours: entity.workingHours,
      turnoverMinutes: entity.turnoverMinutes,
      maxCapacity: entity.maxCapacity,
      isActive: entity.isActive,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  private toEntity(resource: Resource): ResourceEntity {
    const entity = new ResourceEntity();
    entity.id = resource.id;
    entity.tenantId = resource.tenantId;
    entity.type = resource.type;
    entity.refId = resource.refId;
    entity.name = resource.name;
    entity.workingHours = resource.workingHours;
    entity.turnoverMinutes = resource.turnoverMinutes;
    entity.maxCapacity = resource.maxCapacity;
    entity.isActive = resource.isActive;
    entity.createdAt = resource.createdAt;
    entity.updatedAt = resource.updatedAt;
    return entity;
  }
}
