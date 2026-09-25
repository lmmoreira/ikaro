import type { ResourceType } from '@ikaro/types';

// Extracted into its own module (TD44 Story 2) rather than inlined into
// schedule-page-timeline-derived.ts — that file was already close to the 250-line file cap before
// this story's additions (same class of pressure TD44 Story 1 hit with schedule-timeline-formatting.ts).
// LOCATION never reaches this comparator: useSelectableResources already excludes it from the
// resource filter, so resourceTypeById is only ever built from STAFF/ROOM/EQUIPMENT resources.
const RESOURCE_TYPE_RANK: Record<Exclude<ResourceType, 'LOCATION'>, number> = {
  STAFF: 0,
  ROOM: 1,
  EQUIPMENT: 2,
};

export function resourceTypeRank(type: ResourceType | undefined): number {
  if (type === undefined || type === 'LOCATION') return RESOURCE_TYPE_RANK.EQUIPMENT + 1;
  return RESOURCE_TYPE_RANK[type];
}

// Sorts resource *ids* by type priority (STAFF > ROOM > EQUIPMENT) first, then alphabetically by
// display name within the same type — compares by id (not the resolved name) so two resources that
// happen to share a display name can never be conflated. Callers map the sorted ids to display
// names afterward (see buildBookingResourceNamesById).
export function compareResourceIdsByTypePriority(
  resourceNameById: ReadonlyMap<string, string>,
  resourceTypeById: ReadonlyMap<string, ResourceType>,
): (leftId: string, rightId: string) => number {
  return (leftId, rightId) => {
    const rankDiff =
      resourceTypeRank(resourceTypeById.get(leftId)) -
      resourceTypeRank(resourceTypeById.get(rightId));
    if (rankDiff !== 0) return rankDiff;
    const leftName = resourceNameById.get(leftId) ?? leftId;
    const rightName = resourceNameById.get(rightId) ?? rightId;
    return leftName.localeCompare(rightName);
  };
}
