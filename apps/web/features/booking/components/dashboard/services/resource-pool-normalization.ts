import type { ResourceRequirementItem, ResourceResponse, ServiceLegItem } from '@ikaro/types';

// Drops any resourcePoolIds entry that isn't among the passed active resources of the matching
// type — applied to every requirement at save time (not only the one a manager just edited), so
// a resource that went inactive since this requirement was last saved can never be silently
// resubmitted via an unrelated edit (e.g. changing a different type, or just the buffer). The
// per-row normalization in ServiceResourceTypeFields only covers the row actually touched.
export function normalizeResourcePoolIds(
  requirement: ResourceRequirementItem,
  availableResources: readonly ResourceResponse[],
): ResourceRequirementItem {
  if (!requirement.resourcePoolIds) return requirement;
  const activeIds = new Set(
    availableResources
      .filter((resource) => resource.type === requirement.type)
      .map((resource) => resource.id),
  );
  return {
    ...requirement,
    resourcePoolIds: requirement.resourcePoolIds.filter((id) => activeIds.has(id)),
  };
}

// The same normalization for every requirement of every leg of a legged service.
export function normalizeLegsResourcePoolIds(
  legs: readonly ServiceLegItem[],
  availableResources: readonly ResourceResponse[],
): ServiceLegItem[] {
  return legs.map((leg) => ({
    ...leg,
    resourceRequirements: leg.resourceRequirements.map((requirement) =>
      normalizeResourcePoolIds(requirement, availableResources),
    ),
  }));
}
