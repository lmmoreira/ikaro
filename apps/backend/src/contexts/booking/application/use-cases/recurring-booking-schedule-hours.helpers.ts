import { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import { RecurringScheduleOccurrenceConflict } from '../../domain/errors/recurring-booking-schedule.error';
import { RecurrenceOccurrence } from '../../domain/recurrence-rule.helpers';
import { Resource } from '../../domain/resource.aggregate';
import { AvailabilityService } from '../../domain/services/availability.service';
import { ResourceOccupancyWindow } from '../ports/resource-occupancy-repository.port';
import {
  buildHoursDayLookup,
  HoursDayLookup,
  HoursScheduleData,
  resourceWindowHoursVerdict,
} from './schedule-hours.helpers';

// M23-S18 — the recurrence-specific half of a recurring schedule's hours-and-closures check
// (UC-070 step 2): one pass over the term's occurrences, written as pure in-memory code so
// M23-S05's approval step can run the identical check again without the request context. The
// loader, the day lookup and the per-window verdict are shared with the one-off booking in
// schedule-hours.helpers.ts.

export interface HoursCheckInput {
  availabilityService: AvailabilityService;
  businessHours: BusinessHours;
  schedule: HoursScheduleData;
  // The resources that decide each occurrence — the same ones the occupancy check considers.
  resources: Resource[];
  // true (AUTO_ANY and AUTO_FUNGIBLE_POOL): one open resource is enough. false (FIXED_ASSIGNMENT):
  // every considered resource must be open.
  anyOpenResourceSuffices: boolean;
  occurrences: RecurrenceOccurrence[];
  durationMinutes: number;
  // Service.bufferAfterMinutes ?? 0 — with each resource's turnover it forms the trailing gap.
  bufferAfterMinutes: number;
}

// Returns one CLOSED / OUTSIDE_HOURS entry per occurrence that cannot be honored, ordered by
// occurrenceStart. The window checked is the occupancy window (start → start + duration +
// effective trailing gap), which is what availability offers a slot against, so a slot
// availability would not offer (its buffer or turnover runs past closing) is refused too.
export function findHoursConflicts(input: HoursCheckInput): RecurringScheduleOccurrenceConflict[] {
  return evaluateHours(input).conflicts;
}

export interface HoursEvaluation {
  conflicts: RecurringScheduleOccurrenceConflict[];
  // Every (resource, occurrence) pair that is closed or outside hours — including for an occurrence
  // that is still accepted because another considered resource is open (AUTO_ANY), so the plan
  // that picks a resource never picks a closed one.
  unavailable: ResourceOccupancyWindow[];
}

// findHoursConflicts() plus the per-resource verdicts it decides from.
export function evaluateHours(input: HoursCheckInput): HoursEvaluation {
  const lookup = buildHoursDayLookup(input.schedule);
  const conflicts: RecurringScheduleOccurrenceConflict[] = [];
  const unavailable: ResourceOccupancyWindow[] = [];
  for (const occurrence of input.occurrences) {
    const verdicts = input.resources.map((resource) =>
      resourceVerdict(input, lookup, occurrence, resource),
    );
    input.resources.forEach((resource, index) => {
      if (verdicts[index] === 'FREE') return;
      unavailable.push({
        resourceId: resource.id,
        startsAt: occurrence.occurrenceStart,
        endsAt: new Date(occurrence.occurrenceStart.getTime() + input.durationMinutes * 60_000),
      });
    });
    const open = input.anyOpenResourceSuffices
      ? verdicts.includes('FREE')
      : verdicts.every((v) => v === 'FREE');
    if (open) continue;
    // The first considered resource that refuses names the reason.
    const reason = verdicts.find((v) => v !== 'FREE') as 'CLOSED' | 'OUTSIDE_HOURS';
    conflicts.push({ occurrenceStart: occurrence.occurrenceStart, reason });
  }
  conflicts.sort((a, b) => a.occurrenceStart.getTime() - b.occurrenceStart.getTime());
  return { conflicts, unavailable };
}

// One resource's verdict for one occurrence window (start → start + duration + its trailing gap).
function resourceVerdict(
  input: HoursCheckInput,
  lookup: HoursDayLookup,
  occurrence: RecurrenceOccurrence,
  resource: Resource,
): ReturnType<typeof resourceWindowHoursVerdict> {
  const gapMinutes = input.availabilityService.effectiveFlatGapMinutes(
    input.bufferAfterMinutes,
    resource.turnoverMinutes,
  );
  const start = occurrence.occurrenceStart;
  const end = new Date(start.getTime() + (input.durationMinutes + gapMinutes) * 60_000);
  return resourceWindowHoursVerdict({
    availabilityService: input.availabilityService,
    businessHours: input.businessHours,
    lookup,
    resource,
    window: { start, end },
  });
}
