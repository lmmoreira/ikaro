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
import { applyBookingPolicy, toBookingPolicy } from './typeorm-service-booking-policy.mapper';

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
  const classResourceSlots = toClassResourceSlotsOrDefault(entity, children.classResourcePool);

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
    bookingPolicy: toBookingPolicy(entity),
  });
}

// Pre-indexes rows by a key once (O(n)), rather than the O(requirements × poolRows) — and, for
// legs, O(legs × legRequirements × legRequirementPool) — repeated `.filter()` scan the read path
// used to do per parent row. Every child collection is Zod-bounded (packages/validation/src/
// booking.ts) but staying linear costs nothing and scales cleanly regardless.
function groupByKey<T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = map.get(key);
    if (group) group.push(row);
    else map.set(key, [row]);
  }
  return map;
}

function poolResourceIds(
  poolByRequirementId: Map<string, { resourceId: string }[]>,
  requirementId: string,
): string[] | null {
  const rows = poolByRequirementId.get(requirementId);
  return rows?.length ? rows.map((p) => p.resourceId) : null;
}

function toResourceRequirements(
  requirementRows: ServiceResourceRequirementEntity[],
  poolRows: ServiceResourceRequirementPoolEntity[],
): ResourceRequirement[] {
  const poolByRequirementId = groupByKey(poolRows, (p) => p.requirementId);
  return requirementRows.map((row) =>
    ResourceRequirement.reconstitute({
      type: row.resourceType,
      selectionMode: row.selectionMode,
      resourcePoolIds: poolResourceIds(poolByRequirementId, row.id),
      requiredQuantity: row.requiredQuantity,
    }),
  );
}

function toServiceLegs(children: ServiceChildRows): ServiceLeg[] {
  const requirementsByLegId = groupByKey(children.legRequirements, (r) => r.legId);
  const poolByRequirementId = groupByKey(children.legRequirementPool, (p) => p.requirementId);
  return [...children.legs]
    .sort((a, b) => a.legIndex - b.legIndex)
    .map((leg) => {
      const requirementsForLeg = requirementsByLegId.get(leg.id) ?? [];
      return ServiceLeg.reconstitute({
        legIndex: leg.legIndex,
        name: leg.name,
        durationMinutes: leg.durationMinutes,
        transitionGapAfterMinutes: leg.transitionGapAfterMinutes,
        resourceRequirements: requirementsForLeg.map((row) => ({
          type: row.resourceType,
          selectionMode: row.selectionMode,
          resourcePoolIds: poolResourceIds(poolByRequirementId, row.id),
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

// A SESSION service always carries a (possibly empty) classResourceSlots array — an APPOINTMENT
// service always carries null (mutual exclusivity, docs/02-DOMAIN_MODEL.md) — so the empty-rows
// case still has to branch on entity.bookingModel to know which of those two it means.
function toClassResourceSlotsOrDefault(
  entity: ServiceEntity,
  rows: ServiceClassResourcePoolEntity[],
): ClassResourceSlot[] | null {
  if (rows.length) return toClassResourceSlots(rows);
  return entity.bookingModel === 'SESSION' ? [] : null;
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
  applyBookingPolicy(entity, service.bookingPolicy);
  return entity;
}

// toChildEntities()/ServiceChildEntities and their helpers live in
// typeorm-service-child-entities.mapper.ts (split out to stay under docs/CODE_STANDARDS.md's
// file-length limit — that file imports emptyChildRows/ServiceChildRows from here).
