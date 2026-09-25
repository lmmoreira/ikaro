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
  // The booking's own line ids, so AUTO_ANY's workload tie-break (sortByLeastWorkload) never
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
