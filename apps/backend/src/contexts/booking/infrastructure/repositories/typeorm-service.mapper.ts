import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { Money } from '../../../../shared/value-objects/money';
import { ClassResourceSlot } from '../../domain/class-resource-slot';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { Service } from '../../domain/service.aggregate';
import { ServiceLeg } from '../../domain/service-leg';
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

export interface ServiceChildRows {
  requirements: ServiceResourceRequirementEntity[];
  requirementPool: ServiceResourceRequirementPoolEntity[];
  legs: ServiceLegEntity[];
  legRequirements: ServiceLegResourceRequirementEntity[];
  legRequirementPool: ServiceLegResourceRequirementPoolEntity[];
  classResourcePool: ServiceClassResourcePoolEntity[];
}

export function emptyChildRows(): ServiceChildRows {
  return {
    requirements: [],
    requirementPool: [],
    legs: [],
    legRequirements: [],
    legRequirementPool: [],
    classResourcePool: [],
  };
}

export function toDomain(
  entity: ServiceEntity,
  currency: string,
  children: ServiceChildRows,
): Service {
  const legs = children.legs.length ? toServiceLegs(children) : null;
  const resourceRequirements = legs
    ? []
    : toResourceRequirements(children.requirements, children.requirementPool);
  const classResourceSlots = children.classResourcePool.length
    ? toClassResourceSlots(children.classResourcePool)
    : entity.bookingModel === 'SESSION'
      ? []
      : null;

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
    bookingModel: entity.bookingModel,
    resourceRequirements,
    bufferAfterMinutes: entity.bufferAfterMinutes,
    legs,
    classResourceSlots,
  });
}

function poolResourceIds(
  poolRows: { requirementId: string; resourceId: string }[],
  requirementId: string,
): string[] | null {
  const ids = poolRows.filter((p) => p.requirementId === requirementId).map((p) => p.resourceId);
  return ids.length ? ids : null;
}

function toResourceRequirements(
  requirementRows: ServiceResourceRequirementEntity[],
  poolRows: ServiceResourceRequirementPoolEntity[],
): ResourceRequirement[] {
  return requirementRows.map((row) =>
    ResourceRequirement.reconstitute({
      type: row.resourceType,
      selectionMode: row.selectionMode,
      resourcePoolIds: poolResourceIds(poolRows, row.id),
      requiredQuantity: row.requiredQuantity,
    }),
  );
}

function toServiceLegs(children: ServiceChildRows): ServiceLeg[] {
  return [...children.legs]
    .sort((a, b) => a.legIndex - b.legIndex)
    .map((leg) => {
      const requirementsForLeg = children.legRequirements.filter((r) => r.legId === leg.id);
      return ServiceLeg.reconstitute({
        legIndex: leg.legIndex,
        name: leg.name,
        durationMinutes: leg.durationMinutes,
        transitionGapAfterMinutes: leg.transitionGapAfterMinutes,
        resourceRequirements: requirementsForLeg.map((row) => ({
          type: row.resourceType,
          selectionMode: row.selectionMode,
          resourcePoolIds: poolResourceIds(children.legRequirementPool, row.id),
          requiredQuantity: row.requiredQuantity,
        })),
      });
    });
}

function toClassResourceSlots(rows: ServiceClassResourcePoolEntity[]): ClassResourceSlot[] {
  const byType = new Map<ResourceType, string[]>();
  for (const row of rows) {
    const ids = byType.get(row.resourceType) ?? [];
    ids.push(row.resourceId);
    byType.set(row.resourceType, ids);
  }
  return Array.from(byType.entries()).map(([type, eligibleResourceIds]) =>
    ClassResourceSlot.create({ type, eligibleResourceIds }),
  );
}

export function toEntity(service: Service): ServiceEntity {
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
  entity.bookingModel = service.bookingModel;
  entity.bufferAfterMinutes = service.bufferAfterMinutes;
  return entity;
}

export interface ServiceChildEntities {
  requirements: ServiceResourceRequirementEntity[];
  requirementPool: ServiceResourceRequirementPoolEntity[];
  legs: ServiceLegEntity[];
  legRequirements: ServiceLegResourceRequirementEntity[];
  legRequirementPool: ServiceLegResourceRequirementPoolEntity[];
  classResourcePool: ServiceClassResourcePoolEntity[];
}

export function toChildEntities(service: Service): ServiceChildEntities {
  const result: ServiceChildEntities = emptyChildRows();
  addResourceRequirementRows(result, service);
  addLegRows(result, service);
  addClassResourcePoolRows(result, service);
  return result;
}

function addResourceRequirementRows(result: ServiceChildEntities, service: Service): void {
  for (const requirement of service.resourceRequirements) {
    const row = toRequirementRow(ServiceResourceRequirementEntity, service.tenantId, requirement);
    row.serviceId = service.id;
    result.requirements.push(row);
    result.requirementPool.push(
      ...toPoolRows(ServiceResourceRequirementPoolEntity, service.tenantId, row.id, requirement),
    );
  }
}

function addLegRows(result: ServiceChildEntities, service: Service): void {
  for (const leg of service.legs ?? []) {
    const legRow = new ServiceLegEntity();
    legRow.id = uuidv7();
    legRow.tenantId = service.tenantId;
    legRow.serviceId = service.id;
    legRow.legIndex = leg.legIndex;
    legRow.name = leg.name;
    legRow.durationMinutes = leg.durationMinutes;
    legRow.transitionGapAfterMinutes = leg.transitionGapAfterMinutes;
    result.legs.push(legRow);

    for (const requirement of leg.resourceRequirements) {
      const reqRow = toRequirementRow(
        ServiceLegResourceRequirementEntity,
        service.tenantId,
        requirement,
      );
      reqRow.legId = legRow.id;
      result.legRequirements.push(reqRow);
      result.legRequirementPool.push(
        ...toPoolRows(
          ServiceLegResourceRequirementPoolEntity,
          service.tenantId,
          reqRow.id,
          requirement,
        ),
      );
    }
  }
}

function addClassResourcePoolRows(result: ServiceChildEntities, service: Service): void {
  for (const slot of service.classResourceSlots ?? []) {
    for (const resourceId of slot.eligibleResourceIds) {
      const row = new ServiceClassResourcePoolEntity();
      row.tenantId = service.tenantId;
      row.serviceId = service.id;
      row.resourceType = slot.type;
      row.resourceId = resourceId;
      result.classResourcePool.push(row);
    }
  }
}

function toRequirementRow<
  T extends {
    id: string;
    tenantId: string;
    resourceType: ResourceType;
    selectionMode: ResourceRequirement['selectionMode'];
    requiredQuantity: number;
  },
>(EntityClass: new () => T, tenantId: string, requirement: ResourceRequirement): T {
  const row = new EntityClass();
  row.id = uuidv7();
  row.tenantId = tenantId;
  row.resourceType = requirement.type;
  row.selectionMode = requirement.selectionMode;
  row.requiredQuantity = requirement.requiredQuantity;
  return row;
}

function toPoolRows<T extends { tenantId: string; requirementId: string; resourceId: string }>(
  EntityClass: new () => T,
  tenantId: string,
  requirementId: string,
  requirement: ResourceRequirement,
): T[] {
  return (requirement.resourcePoolIds ?? []).map((resourceId) => {
    const row = new EntityClass();
    row.tenantId = tenantId;
    row.requirementId = requirementId;
    row.resourceId = resourceId;
    return row;
  });
}
