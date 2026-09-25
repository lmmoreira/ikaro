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

// Sorts resource assignments by type priority (STAFF > ROOM > EQUIPMENT) first, then
// alphabetically by display name within the same type. Round 3: a booking's own
// StaffBookingCardResponse.assignedResources already carries {resourceType, resourceName}
// directly, so this sorts that shape straight — no resourceId-keyed lookup map needed (that
// approach, resolving names via the tenant's checked-resource day-grid fetch, only existed
// because bookings didn't carry their own resource assignments yet; TD44-S2 round 3 added that
// backend field specifically to remove this indirection).
export function compareResourceAssignmentsByTypePriority<
  T extends { readonly resourceType: ResourceType; readonly resourceName: string },
>(left: T, right: T): number {
  const rankDiff = resourceTypeRank(left.resourceType) - resourceTypeRank(right.resourceType);
  if (rankDiff !== 0) return rankDiff;
  return left.resourceName.localeCompare(right.resourceName);
}
