import type { ResourceRequirementItem, ResourceResponse } from '@ikaro/types';

// A saved explicit pool none of whose resources is active any more. Saving it as-is would strip
// every id and send `[]`, which the backend reads as "unset" (any active resource of the type) —
// silently widening a restriction the manager set on purpose. The panel blocks the save instead
// and asks for new eligible resources.
export function hasStaleEligiblePool(
  requirement: ResourceRequirementItem,
  availableResources: readonly ResourceResponse[],
): boolean {
  const poolIds = requirement.resourcePoolIds;
  if (!poolIds || poolIds.length === 0) return false;
  return !availableResources.some((resource) => poolIds.includes(resource.id));
}

// How many distinct resources a requirement can actually draw on: its explicit eligible list
// (restricted to resources that are still active), or — when the list is empty/unset — every
// active resource of the type. Mirrors the backend's assertRequirementAvailable() and the
// availability/occupancy resolution helpers, where an empty pool means "unset". A stale pool has
// no usable candidates (see hasStaleEligiblePool).
export function countQuantityCandidates(
  requirement: ResourceRequirementItem,
  availableResources: readonly ResourceResponse[],
): number {
  const poolIds = requirement.resourcePoolIds;
  if (!poolIds || poolIds.length === 0) return availableResources.length;
  return availableResources.filter((resource) => poolIds.includes(resource.id)).length;
}

// requiredQuantity is how many DISTINCT candidates one booking needs at once, so asking for more
// than the candidate count can never be satisfied (no slots would ever be offered). The backend
// rejects the same shape with 422 BOOKING_SERVICE_RESOURCE_REQUIREMENT_INVALID.
export function isQuantityUnsatisfiable(
  requirement: ResourceRequirementItem,
  availableResources: readonly ResourceResponse[],
): boolean {
  return requirement.requiredQuantity > countQuantityCandidates(requirement, availableResources);
}

// True when any requirement can never be booked (quantity above its candidates, or a stale pool) —
// what blocks the Recursos save. `availableByType` resolves the active resources of one type.
export function hasUnsatisfiableRequirement(
  requirements: readonly ResourceRequirementItem[],
  availableByType: (type: ResourceRequirementItem['type']) => readonly ResourceResponse[],
): boolean {
  return requirements.some((requirement) =>
    isQuantityUnsatisfiable(requirement, availableByType(requirement.type)),
  );
}
