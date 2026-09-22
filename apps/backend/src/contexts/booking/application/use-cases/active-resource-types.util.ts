import { ActiveResourceIdsByType } from '../../domain/resource-requirement-availability';
import { ResourceType } from '../../domain/resource.types';
import { IResourceRepository } from '../ports/resource-repository.port';

// Shared by UpdateServiceResourceRequirementsUseCase and UpdateServiceLegsUseCase — both need
// every active Resource id per requested type before calling the aggregate's
// setResourceRequirements()/setLegs(), which validate both "does this type have >= 1 active
// Resource" (UC-050 A1 / UC-051's own precondition) and "is this specific resourcePoolIds entry
// itself an active resource of the matching type" (docs/02-DOMAIN_MODEL.md).
export async function resolveActiveResourceIdsByType(
  resourceRepo: IResourceRepository,
  tenantId: string,
  types: ResourceType[],
): Promise<ActiveResourceIdsByType> {
  const distinctTypes = [...new Set(types)];
  const entries = await Promise.all(
    distinctTypes.map(async (type) => {
      const resources = await resourceRepo.findByTenant(tenantId, { type, isActive: true });
      return [type, new Set(resources.map((resource) => resource.id))] as const;
    }),
  );
  return new Map(entries);
}
