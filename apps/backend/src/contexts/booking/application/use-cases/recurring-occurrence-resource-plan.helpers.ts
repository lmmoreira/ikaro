import { localDayBoundsUTC } from '../../../../shared/utils/calendar-date';
import { RecurrenceOccurrence } from '../../domain/recurrence-rule.helpers';
import { ResourceRequirementSelectionMode } from '../../domain/resource-requirement';
import { Resource } from '../../domain/resource.aggregate';
import {
  IResourceOccupancyRepository,
  ResourceOccupancyWindow,
} from '../ports/resource-occupancy-repository.port';

export interface OccurrenceResourcePlanParams {
  tenantId: string;
  timezone: string;
  selectionMode: ResourceRequirementSelectionMode;
  // The resources whose availability decided the occurrences (see resolveConsideredResources).
  resources: Resource[];
  occurrences: RecurrenceOccurrence[];
  // The (resource, occurrence) pairs the whole-term check found unusable — busy from the occupancy
  // query, closed or outside hours from the hours check — so AUTO_ANY never picks one of them.
  unavailableWindows: ResourceOccupancyWindow[];
}

const windowKey = (resourceId: string, startsAt: Date): string =>
  `${resourceId}|${startsAt.getTime()}`;

// The resource every occurrence of a recurring term is assigned to, in occurrence order, for the
// price of at most one extra query however long the term is. It mirrors what resolving each
// occurrence on its own would pick (resolveRequirementResources): a chosen resource
// (CUSTOMER_CHOICE) is the same for every occurrence; AUTO_FUNGIBLE_POOL takes, per occurrence, the
// first resource by resourceId that is open and free at that exact window (a pool has no workload
// balancing); AUTO_ANY takes the least-loaded resource among those open and free at that
// window, resourceId as the stable tie-break, where "load" is the HOLD/COMMITTED occupancy on the
// tenant-local day of the occurrence.
//
// Occurrences fall on different days, so none of them changes another's free set or day load: the
// whole term can be planned from the state before any occurrence is written. That independence is
// what lets materialization insert everything in bulk.
export async function planOccurrenceResources(
  occupancyRepo: IResourceOccupancyRepository,
  params: OccurrenceResourcePlanParams,
): Promise<Resource[]> {
  const { resources, occurrences } = params;
  if (params.selectionMode === 'CUSTOMER_CHOICE' || resources.length <= 1) {
    return occurrences.map(() => resources[0]);
  }

  const unavailable = new Set(
    params.unavailableWindows.map((window) => windowKey(window.resourceId, window.startsAt)),
  );
  const byId = [...resources].sort((a, b) => a.id.localeCompare(b.id));
  const isPool = params.selectionMode === 'AUTO_FUNGIBLE_POOL';
  const dayLoads = isPool ? [] : await loadDayWindows(occupancyRepo, params);

  return occurrences.map(({ occurrenceStart }) => {
    const free = byId.filter(
      (resource) => !unavailable.has(windowKey(resource.id, occurrenceStart)),
    );
    // Falls back to every resource when none is usable, like the one-occurrence resolver: the
    // occupancy insert (and its exclusion constraint) then reports the real conflict.
    const candidates = free.length > 0 ? free : byId;
    if (isPool) return candidates[0];
    const { start, end } = localDayBoundsUTC(occurrenceStart, params.timezone);
    const load = (resource: Resource): number =>
      dayLoads.filter(
        (window) =>
          window.resourceId === resource.id && window.startsAt < end && start < window.endsAt,
      ).length;
    return [...candidates].sort((a, b) => load(a) - load(b) || a.id.localeCompare(b.id))[0];
  });
}

// One query for the whole term: every active window of the considered resources between the
// first occurrence's local day start and the last one's local day end.
function loadDayWindows(
  occupancyRepo: IResourceOccupancyRepository,
  params: OccurrenceResourcePlanParams,
): Promise<ResourceOccupancyWindow[]> {
  const starts = params.occurrences.map(({ occurrenceStart }) => occurrenceStart.getTime());
  const from = localDayBoundsUTC(new Date(Math.min(...starts)), params.timezone).start;
  const to = localDayBoundsUTC(new Date(Math.max(...starts)), params.timezone).end;
  return occupancyRepo.findActiveWindows(
    params.tenantId,
    params.resources.map((resource) => resource.id),
    from,
    to,
  );
}
