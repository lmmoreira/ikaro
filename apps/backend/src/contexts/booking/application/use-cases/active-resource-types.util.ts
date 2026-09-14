import { ResourceType } from '../../domain/resource.types';
import { IResourceRepository } from '../ports/resource-repository.port';

// Shared by UpdateServiceResourceRequirementsUseCase and UpdateServiceLegsUseCase — both need
// "which of these resource types currently have >= 1 active Resource" before calling the
// aggregate's setResourceRequirements()/setLegs() (UC-050 A1 / UC-051's own precondition).
export async function resolveActiveResourceTypes(
  resourceRepo: IResourceRepository,
  tenantId: string,
  types: ResourceType[],
): Promise<Set<ResourceType>> {
  const distinctTypes = [...new Set(types)];
  const results = await Promise.all(
    distinctTypes.map(async (type) => {
      const resources = await resourceRepo.findByTenant(tenantId, { type, isActive: true });
      return resources.length > 0 ? type : null;
    }),
  );
  return new Set(results.filter((type): type is ResourceType => type !== null));
}
