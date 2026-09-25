import { AvailabilityService } from '../../domain/services/availability.service';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceType } from '../../domain/resource.types';
import { IResourceOccupancyRepository } from '../ports/resource-occupancy-repository.port';
import { IResourceRepository } from '../ports/resource-repository.port';

// Shared by resource-occupancy.helpers.ts, resource-occupancy-candidate-builders.helpers.ts, and
// resource-requirement-resolution.helpers.ts (all split out of one file — docs/CODE_STANDARDS.md's
// file-length limit) — kept in its own file specifically so none of those three import from each
// other in a cycle (booking-domain.error.ts's own base-class split documents this exact hazard:
// a circular import crashed backend boot under ts-node once already).

// An internal, three-file-shared deps bag, not a public port.
export interface ResolutionContext {
  resourceRepo: IResourceRepository;
  availabilityService: AvailabilityService;
  occupancyRepo: IResourceOccupancyRepository;
  tenantId: string;
  timezone: string;
  resourceCache: Map<string, Resource>;
  // The tenant's full active-resource set for a given type, loaded once by
  // resolveEligibleResources() and reused by every later line/requirement needing the same type
  // within this same resolution call — a multi-line booking with several lines sharing one
  // service (and therefore one requirement type) must not re-query per line.
  activeResourcesByType: Map<ResourceType, Resource[]>;
  // The booking's own line ids, so AUTO_ANY's workload tie-break (sortResourcesByLeastWorkload) never
  // counts this booking's own existing HOLD/COMMITTED occupancy against itself when
  // approve-booking/reschedule-booking re-resolve fresh — same self-exclusion shape
  // findConflictingResourceIds already has via excludeBookingLineIds. Empty at creation time (the
  // lines are brand new, nothing to exclude).
  excludeBookingLineIds: string[];
}

export function selectionKey(
  serviceId: string,
  legIndex: number | null,
  resourceType: ResourceType,
): string {
  return `${serviceId}|${legIndex ?? -1}|${resourceType}`;
}

// Two lines booking the same service (docs/14-API_CONTRACTS.md's "duplicates are allowed — two
// Basic Wash lines = two cars") share one selectionKey(), so a single selectionsByKey.get(key)
// can't tell which occurrence it's for. consumeSelections() instead shifts the next `count` (=
// requirement.requiredQuantity) ids off the front of that key's submitted-order queue and mutates
// it in place — mirroring the same "order is preserved" guarantee the API contract already makes
// for serviceIds, extended to resourceSelections: the Nth occurrence of a duplicated service
// consumes the Nth batch of that key's submitted selections, in submission order, never the same
// batch every line resolves against. Called for every requirement regardless of selectionMode —
// harmless for AUTO_ANY/AUTO_FUNGIBLE_POOL/NONE (which never read chosenResourceIds), and a given
// (serviceId, legIndex, resourceType) key always maps to exactly one requirement configuration, so
// it always has exactly one selectionMode: no cross-mode contention over the same queue is
// possible.
export function consumeSelections(
  selectionsByKey: Map<string, string[]>,
  key: string,
  count: number,
): string[] {
  const queue = selectionsByKey.get(key);
  if (!queue || queue.length === 0) return [];
  return queue.splice(0, count);
}
