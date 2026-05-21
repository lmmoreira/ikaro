import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { Money } from '../../../../shared/value-objects/money';
import { IServiceRepository } from '../../application/ports/service-repository.port';
import { Service } from '../../domain/service.aggregate';
import { ServiceEntity } from '../entities/service.entity';

@Injectable()
export class TypeOrmServiceRepository implements IServiceRepository {
  constructor(
    @InjectRepository(ServiceEntity)
    private readonly repo: Repository<ServiceEntity>,
  ) {}

  async findById(id: string, tenantId: string): Promise<Service | null> {
    const entity = await this.repo.findOne({ where: { id, tenantId } });
    return entity ? this.toDomain(entity) : null;
  }

  async findAllByTenant(tenantId: string, onlyActive = false): Promise<Service[]> {
    const where = onlyActive ? { tenantId, isActive: true } : { tenantId };
    const entities = await this.repo.find({ where, order: { createdAt: 'ASC' } });
    return entities.map((e) => this.toDomain(e));
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

  private toDomain(entity: ServiceEntity): Service {
    return Service.reconstitute({
      id: entity.id,
      tenantId: entity.tenantId,
      name: entity.name,
      description: entity.description,
      price: Money.from(entity.priceAmount, 'BRL'),
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
