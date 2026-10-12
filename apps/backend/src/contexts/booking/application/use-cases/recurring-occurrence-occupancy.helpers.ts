import { RecurringScheduleOccurrenceConflict } from '../../domain/errors/recurring-booking-schedule.error';
import { RecurrenceOccurrence } from '../../domain/recurrence-rule.helpers';
import { Resource } from '../../domain/resource.aggregate';
import { AvailabilityService } from '../../domain/services/availability.service';
import {
  IResourceOccupancyRepository,
  ResourceOccupancyWindow,
} from '../ports/resource-occupancy-repository.port';

// What the occupancy check needs from each requirement: the resources that decide it and whether
// one free resource suffices (see ConsideredRequirement).
export interface OccupancyGroup {
  resources: Resource[];
  anyFreeResourceSuffices: boolean;
}

export interface OccupancyCheckInput {
  occupancyRepo: IResourceOccupancyRepository;
  availabilityService: AvailabilityService;
  tenantId: string;
  occurrences: RecurrenceOccurrence[];
  durationMinutes: number;
  bufferAfterMinutes: number;
  // One group per requirement of the service. Their windows go into a single query, so the cost
  // does not grow with the number of requirements.
  groups: OccupancyGroup[];
}

// The occupancy half of the whole-term check: every (resource x occurrence) window — each
// extended by that resource's own trailing gap — goes into one findConflictingWindows() query, and
// the verdict per occurrence is decided in memory. An occurrence is refused when any requirement
// is unsatisfied. The busy windows are returned as well: the resource plan reads them to tell which
// resources are free at each occurrence.
export async function findOccupiedRefusals(input: OccupancyCheckInput): Promise<{
  refusals: RecurringScheduleOccurrenceConflict[];
  conflictingWindows: ResourceOccupancyWindow[];
}> {
  const conflictingWindows = await input.occupancyRepo.findConflictingWindows(
    input.tenantId,
    buildOccurrenceWindows(input),
  );
  const blocked = new Set<number>();
  for (const group of input.groups) {
    for (const start of blockedOccurrenceStarts(conflictingWindows, input.occurrences, group)) {
      blocked.add(start.getTime());
    }
  }
  const refusals = input.occurrences
    .filter(({ occurrenceStart }) => blocked.has(occurrenceStart.getTime()))
    .map(({ occurrenceStart }) => ({ occurrenceStart, reason: 'OCCUPIED' as const }));
  return { refusals, conflictingWindows };
}

function buildOccurrenceWindows(input: OccupancyCheckInput): ResourceOccupancyWindow[] {
  const durationMs = input.durationMinutes * 60_000;
  const resources = new Map(
    input.groups.flatMap(({ resources: group }) =>
      group.map((resource): [string, Resource] => [resource.id, resource]),
    ),
  );
  return input.occurrences.flatMap(({ occurrenceStart }) =>
    [...resources.values()].map((resource) => {
      const gapMinutes = input.availabilityService.effectiveFlatGapMinutes(
        input.bufferAfterMinutes,
        resource.turnoverMinutes,
      );
      return {
        resourceId: resource.id,
        startsAt: occurrenceStart,
        endsAt: new Date(occurrenceStart.getTime() + durationMs + gapMinutes * 60_000),
      };
    }),
  );
}

// An occurrence is blocked when a resource a requirement needs is busy: a single conflicting
// window suffices, except when one free resource is enough — then only when every considered
// resource of that requirement is busy in that occurrence.
function blockedOccurrenceStarts(
  conflicting: ResourceOccupancyWindow[],
  occurrences: RecurrenceOccurrence[],
  group: OccupancyGroup,
): Date[] {
  const groupIds = new Set(group.resources.map((resource) => resource.id));
  const busyByStart = new Map<number, Set<string>>();
  for (const { resourceId, startsAt } of conflicting) {
    if (!groupIds.has(resourceId)) continue;
    const key = startsAt.getTime();
    busyByStart.set(key, (busyByStart.get(key) ?? new Set<string>()).add(resourceId));
  }
  return occurrences
    .filter(({ occurrenceStart }) => {
      const busy = busyByStart.get(occurrenceStart.getTime());
      if (!busy) return false;
      return group.anyFreeResourceSuffices
        ? group.resources.every((resource) => busy.has(resource.id))
        : true;
    })
    .map(({ occurrenceStart }) => occurrenceStart);
}

// When one free resource is enough, the hours check and the occupancy check each look for it on
// their own: resource A closed (but free) satisfies the occupancy check, resource B busy (but open)
// satisfies the hours check, and neither reports the occurrence although no resource is both open
// and free. This is the combined verdict — an occurrence is refused when every considered resource
// is closed or busy in it, whichever mix of the two.
export function findCombinedRefusals(input: {
  occurrences: RecurrenceOccurrence[];
  resources: Resource[];
  // Busy windows from the occupancy query plus closed / outside-hours windows from the hours check.
  unavailable: ResourceOccupancyWindow[];
}): RecurringScheduleOccurrenceConflict[] {
  const unavailableByStart = new Map<number, Set<string>>();
  for (const { resourceId, startsAt } of input.unavailable) {
    const key = startsAt.getTime();
    unavailableByStart.set(key, (unavailableByStart.get(key) ?? new Set<string>()).add(resourceId));
  }
  return input.occurrences
    .filter(({ occurrenceStart }) => {
      const unavailable = unavailableByStart.get(occurrenceStart.getTime());
      return unavailable !== undefined && input.resources.every((r) => unavailable.has(r.id));
    })
    .map(({ occurrenceStart }) => ({ occurrenceStart, reason: 'OCCUPIED' as const }));
}
