import { RecurringScheduleOccurrenceConflict } from '../../domain/errors/recurring-booking-schedule.error';
import { RecurrenceOccurrence } from '../../domain/recurrence-rule.helpers';
import { Resource } from '../../domain/resource.aggregate';
import { AvailabilityService } from '../../domain/services/availability.service';
import {
  IResourceOccupancyRepository,
  ResourceOccupancyWindow,
} from '../ports/resource-occupancy-repository.port';

export interface OccupancyCheckInput {
  occupancyRepo: IResourceOccupancyRepository;
  availabilityService: AvailabilityService;
  tenantId: string;
  occurrences: RecurrenceOccurrence[];
  durationMinutes: number;
  bufferAfterMinutes: number;
  resources: Resource[];
  anyFreeResourceSuffices: boolean;
}

// The occupancy half of the whole-term check: every (resource x occurrence) window — each
// extended by that resource's own trailing gap — goes into one findConflictingWindows() query, and
// the verdict per occurrence is decided in memory. The busy windows are returned as well: the
// resource plan reads them to tell which resources are free at each occurrence.
export async function findOccupiedRefusals(input: OccupancyCheckInput): Promise<{
  refusals: RecurringScheduleOccurrenceConflict[];
  conflictingWindows: ResourceOccupancyWindow[];
}> {
  const conflictingWindows = await input.occupancyRepo.findConflictingWindows(
    input.tenantId,
    buildOccurrenceWindows(input),
  );
  const refusals = blockedOccurrenceStarts(conflictingWindows, input).map((occurrenceStart) => ({
    occurrenceStart,
    reason: 'OCCUPIED' as const,
  }));
  return { refusals, conflictingWindows };
}

function buildOccurrenceWindows(input: OccupancyCheckInput): ResourceOccupancyWindow[] {
  const durationMs = input.durationMinutes * 60_000;
  return input.occurrences.flatMap(({ occurrenceStart }) =>
    input.resources.map((resource) => {
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

// An occurrence is blocked when a resource it needs is busy: a single conflicting window suffices,
// except when one free resource is enough — then only when every considered resource is busy in
// that occurrence.
function blockedOccurrenceStarts(
  conflicting: ResourceOccupancyWindow[],
  input: OccupancyCheckInput,
): Date[] {
  const busyByStart = new Map<number, Set<string>>();
  for (const { resourceId, startsAt } of conflicting) {
    const key = startsAt.getTime();
    busyByStart.set(key, (busyByStart.get(key) ?? new Set<string>()).add(resourceId));
  }
  return input.occurrences
    .filter(({ occurrenceStart }) => {
      const busy = busyByStart.get(occurrenceStart.getTime());
      if (!busy) return false;
      return input.anyFreeResourceSuffices
        ? input.resources.every((resource) => busy.has(resource.id))
        : true;
    })
    .map(({ occurrenceStart }) => occurrenceStart);
}
