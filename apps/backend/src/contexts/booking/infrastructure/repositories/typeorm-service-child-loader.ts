import { EntityManager, In } from 'typeorm';
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

interface RawServiceChildRows {
  requirements: ServiceResourceRequirementEntity[];
  legs: ServiceLegEntity[];
  classResourcePool: ServiceClassResourcePoolEntity[];
  requirementPool: ServiceResourceRequirementPoolEntity[];
  legRequirements: ServiceLegResourceRequirementEntity[];
  legRequirementPool: ServiceLegResourceRequirementPoolEntity[];
}

// Extracted out of typeorm-service.repository.ts to keep that file under
// docs/CODE_STANDARDS.md's file-length limit (same justification as service-leg-span.ts's own
// extraction) — this cluster is already a self-contained concern (loading + grouping every
// Service child-table row), independent of the repository's own CRUD/locking methods.
export async function loadServiceChildren(
  manager: EntityManager,
  tenantId: string,
  serviceIds: string[],
): Promise<Map<string, ServiceChildRows>> {
  const result = new Map<string, ServiceChildRows>(serviceIds.map((id) => [id, emptyChildRows()]));
  if (!serviceIds.length) return result;

  const raw = await fetchRawChildRows(manager, tenantId, serviceIds);
  groupChildRowsByService(result, raw);
  return result;
}

async function fetchRawChildRows(
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
  const { requirementPool, legRequirements, legRequirementPool } = await fetchNestedChildRows(
    manager,
    tenantId,
    requirements,
    legs,
  );

  return {
    requirements,
    legs,
    classResourcePool,
    requirementPool,
    legRequirements,
    legRequirementPool,
  };
}

async function fetchNestedChildRows(
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

function groupChildRowsByService(
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
