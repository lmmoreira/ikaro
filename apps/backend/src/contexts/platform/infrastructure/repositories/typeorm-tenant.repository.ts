import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ITenantRepository } from '../../application/ports/tenant-repository.port';
import { Tenant } from '../../domain/tenant.aggregate';
import { TenantSettings } from '../../domain/value-objects/tenant-settings.vo';
import { TenantEntity } from '../entities/tenant.entity';

@Injectable()
export class TypeOrmTenantRepository implements ITenantRepository {
  constructor(
    @InjectRepository(TenantEntity)
    private readonly repo: Repository<TenantEntity>,
  ) {}

  async findBySlug(slug: string): Promise<Tenant | null> {
    const entity = await this.repo.findOne({ where: { slug } });
    return entity ? this.toDomain(entity) : null;
  }

  async findById(id: string): Promise<Tenant | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? this.toDomain(entity) : null;
  }

  async save(tenant: Tenant): Promise<void> {
    const entity = this.toEntity(tenant);
    await this.repo.save(entity);
  }

  async existsBySlug(slug: string): Promise<boolean> {
    return this.repo.existsBy({ slug });
  }

  private toDomain(entity: TenantEntity): Tenant {
    return Tenant.reconstitute({
      id: entity.id,
      name: entity.name,
      slug: entity.slug,
      settings: TenantSettings.reconstitute(entity.settings),
      isActive: entity.isActive,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  private toEntity(tenant: Tenant): TenantEntity {
    const entity = new TenantEntity();
    entity.id = tenant.id;
    entity.name = tenant.name;
    entity.slug = tenant.slug;
    entity.settings = tenant.settings.toJSON();
    entity.isActive = tenant.isActive;
    entity.createdAt = tenant.createdAt;
    entity.updatedAt = tenant.updatedAt;
    return entity;
  }
}
