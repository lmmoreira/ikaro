import type { ResourceRequirementItem, ResourceResponse } from '@ikaro/types';

// How many distinct resources a requirement can actually draw on: its explicit eligible list
// (restricted to resources that are still active), or — when the list is empty/unset — every
// active resource of the type. Mirrors the backend's assertRequirementAvailable() and the
// availability/occupancy resolution helpers, where an empty pool means "unset".
export function countQuantityCandidates(
  requirement: ResourceRequirementItem,
  availableResources: readonly ResourceResponse[],
): number {
  const poolIds = requirement.resourcePoolIds;
  if (!poolIds || poolIds.length === 0) return availableResources.length;
  const activeEligible = availableResources.filter((resource) => poolIds.includes(resource.id));
  // Every listed id went inactive → the save-time normalization empties the list, which the
  // backend then reads as "unset" (all active of the type).
  return activeEligible.length > 0 ? activeEligible.length : availableResources.length;
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
