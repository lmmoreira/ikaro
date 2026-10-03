// A requirement's resourcePoolIds restricts candidates only when non-null AND non-empty — an empty
// array is "unrestricted" everywhere (ResourceRequirementSchema has no .min(1)). Single source of
// that rule for the write path, the availability read path and the public resource-options read.
export function isInResourcePool(resourcePoolIds: string[] | null, resourceId: string): boolean {
  return !resourcePoolIds?.length || resourcePoolIds.includes(resourceId);
}

export function filterByResourcePool<T extends { id: string }>(
  resources: T[],
  resourcePoolIds: string[] | null,
): T[] {
  return resources.filter((resource) => isInResourcePool(resourcePoolIds, resource.id));
}
