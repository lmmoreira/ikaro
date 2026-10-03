import type {
  HotsiteServiceResourceOptionsRequirement,
  ResourceSelectionItem,
  ResourceType,
} from '@ikaro/types';

type PickTarget = Pick<ResourceSelectionItem, 'serviceId' | 'legIndex' | 'resourceType'>;

export function isSamePickTarget(a: PickTarget, b: PickTarget): boolean {
  return (
    a.serviceId === b.serviceId &&
    (a.legIndex ?? null) === (b.legIndex ?? null) &&
    a.resourceType === b.resourceType
  );
}

export function findPick(
  picks: readonly ResourceSelectionItem[],
  requirement: Pick<
    HotsiteServiceResourceOptionsRequirement,
    'serviceId' | 'legIndex' | 'resourceType'
  >,
): string | undefined {
  return picks.find((pick) => isSamePickTarget(pick, requirement))?.resourceId;
}

export function setPick(
  picks: readonly ResourceSelectionItem[],
  next: ResourceSelectionItem,
): ResourceSelectionItem[] {
  return [...picks.filter((pick) => !isSamePickTarget(pick, next)), next];
}

export function toResourceSelectionItem(
  requirement: Pick<
    HotsiteServiceResourceOptionsRequirement,
    'serviceId' | 'legIndex' | 'resourceType'
  >,
  resourceId: string,
): ResourceSelectionItem {
  return {
    serviceId: requirement.serviceId,
    legIndex: requirement.legIndex,
    resourceType: requirement.resourceType,
    resourceId,
  };
}

const TYPE_ORDER: readonly ResourceType[] = ['STAFF', 'ROOM', 'EQUIPMENT', 'LOCATION'];

/** The picks in `serviceIds` order (then leg, then resource type) — the order the booking is sent in. */
export function orderPicks(
  picks: readonly ResourceSelectionItem[],
  serviceIds: readonly string[],
): ResourceSelectionItem[] {
  return serviceIds.flatMap((serviceId) =>
    picks
      .filter((pick) => pick.serviceId === serviceId)
      .sort(
        (a, b) =>
          (a.legIndex ?? -1) - (b.legIndex ?? -1) ||
          TYPE_ORDER.indexOf(a.resourceType) - TYPE_ORDER.indexOf(b.resourceType),
      ),
  );
}

export function removeInvalidPicks(
  picks: readonly ResourceSelectionItem[],
  requirements: readonly HotsiteServiceResourceOptionsRequirement[],
): ResourceSelectionItem[] {
  return picks.filter((pick) => {
    const requirement = requirements.find((candidate) => isSamePickTarget(candidate, pick));
    return requirement?.options.some((option) => option.resourceId === pick.resourceId) === true;
  });
}

export function isRequirementPicked(
  picks: readonly ResourceSelectionItem[],
  requirement: HotsiteServiceResourceOptionsRequirement,
): boolean {
  return findPick(picks, requirement) !== undefined;
}
