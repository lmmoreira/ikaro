import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { runInNewTransaction } from '../../../../shared/infrastructure/run-in-new-transaction';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import {
  ITenantSettingsPort,
  TENANT_SETTINGS_PORT,
} from '../../../../shared/ports/tenant-settings.port';
import {
  IServiceRepository,
  ServiceFilters,
} from '../../application/ports/service-repository.port';
import { Service, ServiceBookingModel } from '../../domain/service.aggregate';
import { ServiceClassResourcePoolEntity } from '../entities/service-class-resource-pool.entity';
import {
  ServiceLegEntity,
  ServiceLegResourceRequirementEntity,
  ServiceLegResourceRequirementPoolEntity,
} from '../entities/service-leg.entity';
import {
  ServiceResourceRequirementEntity,
  ServiceResourceRequirementPoolEntity,
} from '../entities/service-resource-requirement.entity';
import { ServiceEntity } from '../entities/service.entity';
import { loadServiceChildren } from './typeorm-service-child-loader';
import { emptyChildRows, toChildEntities, toDomain, toEntity } from './typeorm-service.mapper';

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
    const children = await loadServiceChildren(this.repo.manager, tenantId, [id]);
    return toDomain(entity, currency, children.get(id) ?? emptyChildRows());
  }

  async findByIdForUpdate(id: string, tenantId: string): Promise<Service | null> {
    const manager = getActiveEntityManager();
    if (!manager) {
      throw new Error('findByIdForUpdate must be called inside an active transaction');
    }
    const entity = await manager.findOne(ServiceEntity, {
      where: { id, tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!entity) return null;
    const { currency } = (await this.settingsPort.getSettings(tenantId)).localization;
    const children = await loadServiceChildren(manager, tenantId, [id]);
    return toDomain(entity, currency, children.get(id) ?? emptyChildRows());
  }

  async findByIds(ids: string[], tenantId: string): Promise<Service[]> {
    if (ids.length === 0) return [];
    const entities = await this.repo.find({ where: ids.map((id) => ({ id, tenantId })) });
    return this.hydrateAll(entities, tenantId);
  }

  async lockBookingModels(
    ids: string[],
    tenantId: string,
  ): Promise<Map<string, ServiceBookingModel>> {
    if (ids.length === 0) return new Map();
    const manager = getActiveEntityManager();
    if (!manager) {
      throw new Error('lockBookingModels must be called inside an active transaction');
    }
    // Ordered by id — Postgres gives no row-lock acquisition order guarantee for an unordered
    // IN (...) query, so two concurrent baskets referencing overlapping services in different
    // array orders (booking-request.helpers.ts builds serviceIds from a caller-supplied line
    // order) could otherwise still acquire locks in different orders and deadlock. A fixed,
    // caller-independent order closes that regardless of request payload order.
    const rows = await manager.find(ServiceEntity, {
      where: { id: In(ids), tenantId },
      select: { id: true, bookingModel: true },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    return new Map(rows.map((row) => [row.id, row.bookingModel]));
  }

  async findAllByTenant(tenantId: string, filters: ServiceFilters = {}): Promise<Service[]> {
    if (filters.ids?.length === 0) return [];
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
    return this.hydrateAll(entities, tenantId);
  }

  async save(service: Service): Promise<void> {
    const entity = toEntity(service);
    const manager = getActiveEntityManager();
    if (manager) {
      await this.persist(manager, service, entity);
    } else {
      await runInNewTransaction(this.repo.manager, (tx) => this.persist(tx, service, entity));
    }
  }

  private async hydrateAll(entities: ServiceEntity[], tenantId: string): Promise<Service[]> {
    if (!entities.length) return [];
    const { currency } = (await this.settingsPort.getSettings(tenantId)).localization;
    const children = await loadServiceChildren(
      this.repo.manager,
      tenantId,
      entities.map((e) => e.id),
    );
    return entities.map((e) => toDomain(e, currency, children.get(e.id) ?? emptyChildRows()));
  }

  private async persist(
    manager: EntityManager,
    service: Service,
    entity: ServiceEntity,
  ): Promise<void> {
    await manager.save(ServiceEntity, entity);
    // Skip the child wholesale-replace entirely when nothing resource-shape-related changed —
    // a plain name/price/isActive update on a service with the maximum permitted 20 legs x 20
    // requirements x 50 pool IDs would otherwise rewrite ~20,000 rows on every save.
    // Service.hasChildrenChanges is true on create() and after setResourceRequirements()/
    // setLegs()/changeBookingModel(), false otherwise (see service.aggregate.ts).
    if (service.hasChildrenChanges) await this.syncChildren(manager, service);
  }

  // Wholesale replace, per the story's own "replaces resourceRequirements wholesale (not a
  // diff/patch)" design — parent-row deletes cascade to their pool tables (ON DELETE CASCADE).
  private async syncChildren(manager: EntityManager, service: Service): Promise<void> {
    const children = toChildEntities(service);

    await manager.delete(ServiceResourceRequirementEntity, {
      tenantId: service.tenantId,
      serviceId: service.id,
    });
    await manager.delete(ServiceLegEntity, { tenantId: service.tenantId, serviceId: service.id });
    await manager.delete(ServiceClassResourcePoolEntity, {
      tenantId: service.tenantId,
      serviceId: service.id,
    });

    if (children.requirements.length) {
      await manager.save(ServiceResourceRequirementEntity, children.requirements);
    }
    if (children.requirementPool.length) {
      await manager.save(ServiceResourceRequirementPoolEntity, children.requirementPool);
    }
    if (children.legs.length) await manager.save(ServiceLegEntity, children.legs);
    if (children.legRequirements.length) {
      await manager.save(ServiceLegResourceRequirementEntity, children.legRequirements);
    }
    if (children.legRequirementPool.length) {
      await manager.save(ServiceLegResourceRequirementPoolEntity, children.legRequirementPool);
    }
    if (children.classResourcePool.length) {
      await manager.save(ServiceClassResourcePoolEntity, children.classResourcePool);
    }
  }
}
