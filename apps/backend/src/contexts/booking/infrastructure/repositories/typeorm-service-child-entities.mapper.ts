import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
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
import { emptyChildRows, ServiceChildRows } from './typeorm-service.mapper';

// Split out of typeorm-service.mapper.ts to stay under docs/CODE_STANDARDS.md's file-length
// limit — the write side (Service -> child entity rows) is self-contained from the read side
// (child entity rows -> Service) that file keeps.

export type ServiceChildEntities = ServiceChildRows;

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
