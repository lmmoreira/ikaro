import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import {
  ITenantSettingsPort,
  TENANT_SETTINGS_PORT,
} from '../../../../shared/ports/tenant-settings.port';
import { Money } from '../../../../shared/value-objects/money';
import {
  IServiceRepository,
  ServiceFilters,
} from '../../application/ports/service-repository.port';
import { Service } from '../../domain/service.aggregate';
import { ServiceEntity } from '../entities/service.entity';

@Injectable()
export class TypeOrmServiceRepository implements IServiceRepository {
  constructor(
    @InjectRepository(ServiceEntity)
    private readonly repo: Repository<ServiceEntity>,
    @Inject(TENANT_SETTINGS_PORT) private readonly settingsPort: ITenantSettingsPort,
  ) {}

  async findById(id: string, tenantId: string): Promise<Service | null> {
    const entity = await this.repo.findOne({ where: { id, tenantId } });
    if (!entity) return null;
    const { currency } = (await this.settingsPort.getSettings(tenantId)).localization;
    return this.toDomain(entity, currency);
  }

  async findByIds(ids: string[], tenantId: string): Promise<Service[]> {
    if (ids.length === 0) return [];
    const entities = await this.repo.find({ where: ids.map((id) => ({ id, tenantId })) });
    const { currency } = (await this.settingsPort.getSettings(tenantId)).localization;
    return entities.map((e) => this.toDomain(e, currency));
  }

  async findAllByTenant(tenantId: string, filters: ServiceFilters = {}): Promise<Service[]> {
    if (filters.ids && filters.ids.length === 0) return [];
    const query = this.repo
      .createQueryBuilder('service')
      .where('service.tenantId = :tenantId', { tenantId })
      .orderBy('service.createdAt', 'ASC');

    if (filters.ids) query.andWhere('service.id IN (:...ids)', { ids: filters.ids });
    if (filters.status === 'ACTIVE')
      query.andWhere('service.isActive = :isActive', { isActive: true });
    if (filters.status === 'INACTIVE') {
      query.andWhere('service.isActive = :isActive', { isActive: false });
    }
    if (filters.search)
      query.andWhere('service.name ILIKE :search', { search: `%${filters.search}%` });

    const entities = await query.getMany();
    const { currency } = (await this.settingsPort.getSettings(tenantId)).localization;
    return entities.map((e) => this.toDomain(e, currency));
  }

  async save(service: Service): Promise<void> {
    const entity = this.toEntity(service);
    const manager = getActiveEntityManager();
    if (manager) {
      await manager.save(ServiceEntity, entity);
    } else {
      await this.repo.save(entity);
    }
  }

  private toDomain(entity: ServiceEntity, currency: string): Service {
    return Service.reconstitute({
      id: entity.id,
      tenantId: entity.tenantId,
      name: entity.name,
      description: entity.description,
      price: Money.from(entity.priceAmount, currency),
      durationMinutes: entity.durationMinutes,
      loyaltyPointsValue: entity.loyaltyPointsValue,
      requiresPickupAddress: entity.requiresPickupAddress,
      isActive: entity.isActive,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  private toEntity(service: Service): ServiceEntity {
    const entity = new ServiceEntity();
    entity.id = service.id;
    entity.tenantId = service.tenantId;
    entity.name = service.name;
    entity.description = service.description;
    entity.priceAmount = service.price.amount.toFixed(2);
    entity.durationMinutes = service.durationMinutes;
    entity.loyaltyPointsValue = service.loyaltyPointsValue;
    entity.requiresPickupAddress = service.requiresPickupAddress;
    entity.isActive = service.isActive;
    entity.createdAt = service.createdAt;
    entity.updatedAt = service.updatedAt;
    return entity;
  }
}
