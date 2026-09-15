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
import { Service } from '../../domain/service.aggregate';
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
import {
  emptyChildRows,
  ServiceChildRows,
  toChildEntities,
  toDomain,
  toEntity,
} from './typeorm-service.mapper';

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
    const children = await this.loadChildren(this.repo.manager, tenantId, [id]);
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
    const children = await this.loadChildren(manager, tenantId, [id]);
    return toDomain(entity, currency, children.get(id) ?? emptyChildRows());
  }

  async findByIds(ids: string[], tenantId: string): Promise<Service[]> {
    if (ids.length === 0) return [];
    const entities = await this.repo.find({ where: ids.map((id) => ({ id, tenantId })) });
    return this.hydrateAll(entities, tenantId);
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
    const children = await this.loadChildren(
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
    await this.syncChildren(manager, service);
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

  private async loadChildren(
    manager: EntityManager,
    tenantId: string,
    serviceIds: string[],
  ): Promise<Map<string, ServiceChildRows>> {
    const result = new Map<string, ServiceChildRows>(
      serviceIds.map((id) => [id, emptyChildRows()]),
    );
    if (!serviceIds.length) return result;

    const raw = await this.fetchRawChildRows(manager, tenantId, serviceIds);
    this.groupChildRowsByService(result, raw);
    return result;
  }

  private async fetchRawChildRows(
    manager: EntityManager,
    tenantId: string,
    serviceIds: string[],
  ): Promise<RawServiceChildRows> {
    const [requirements, legs, classResourcePool] = await Promise.all([
      manager.find(ServiceResourceRequirementEntity, {
        where: { tenantId, serviceId: In(serviceIds) },
      }),
      manager.find(ServiceLegEntity, { where: { tenantId, serviceId: In(serviceIds) } }),
      manager.find(ServiceClassResourcePoolEntity, {
        where: { tenantId, serviceId: In(serviceIds) },
      }),
    ]);
    const { requirementPool, legRequirements, legRequirementPool } =
      await this.fetchNestedChildRows(manager, tenantId, requirements, legs);

    return {
      requirements,
      legs,
      classResourcePool,
      requirementPool,
      legRequirements,
      legRequirementPool,
    };
  }

  private async fetchNestedChildRows(
    manager: EntityManager,
    tenantId: string,
    requirements: ServiceResourceRequirementEntity[],
    legs: ServiceLegEntity[],
  ): Promise<
    Pick<RawServiceChildRows, 'requirementPool' | 'legRequirements' | 'legRequirementPool'>
  > {
    const requirementIds = requirements.map((r) => r.id);
    const legIds = legs.map((l) => l.id);
    const [requirementPool, legRequirements] = await Promise.all([
      requirementIds.length
        ? manager.find(ServiceResourceRequirementPoolEntity, {
            where: { tenantId, requirementId: In(requirementIds) },
          })
        : Promise.resolve([]),
      legIds.length
        ? manager.find(ServiceLegResourceRequirementEntity, {
            where: { tenantId, legId: In(legIds) },
          })
        : Promise.resolve([]),
    ]);
    const legRequirementIds = legRequirements.map((r) => r.id);
    const legRequirementPool = legRequirementIds.length
      ? await manager.find(ServiceLegResourceRequirementPoolEntity, {
          where: { tenantId, requirementId: In(legRequirementIds) },
        })
      : [];

    return { requirementPool, legRequirements, legRequirementPool };
  }

  private groupChildRowsByService(
    result: Map<string, ServiceChildRows>,
    raw: RawServiceChildRows,
  ): void {
    const requirementToService = new Map(raw.requirements.map((r) => [r.id, r.serviceId]));
    const legToService = new Map(raw.legs.map((l) => [l.id, l.serviceId]));
    const legRequirementToLeg = new Map(raw.legRequirements.map((r) => [r.id, r.legId]));

    for (const row of raw.requirements) result.get(row.serviceId)?.requirements.push(row);
    for (const row of raw.legs) result.get(row.serviceId)?.legs.push(row);
    for (const row of raw.classResourcePool) result.get(row.serviceId)?.classResourcePool.push(row);
    for (const row of raw.requirementPool) {
      const serviceId = requirementToService.get(row.requirementId);
      if (serviceId) result.get(serviceId)?.requirementPool.push(row);
    }
    for (const row of raw.legRequirements) {
      const serviceId = legToService.get(row.legId);
      if (serviceId) result.get(serviceId)?.legRequirements.push(row);
    }
    for (const row of raw.legRequirementPool) {
      const legId = legRequirementToLeg.get(row.requirementId);
      const serviceId = legId ? legToService.get(legId) : undefined;
      if (serviceId) result.get(serviceId)?.legRequirementPool.push(row);
    }
  }
}

interface RawServiceChildRows {
  requirements: ServiceResourceRequirementEntity[];
  legs: ServiceLegEntity[];
  classResourcePool: ServiceClassResourcePoolEntity[];
  requirementPool: ServiceResourceRequirementPoolEntity[];
  legRequirements: ServiceLegResourceRequirementEntity[];
  legRequirementPool: ServiceLegResourceRequirementPoolEntity[];
}
