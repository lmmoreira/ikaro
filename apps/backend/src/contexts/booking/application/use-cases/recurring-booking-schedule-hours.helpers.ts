import { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import { RecurringScheduleOccurrenceConflict } from '../../domain/errors/recurring-booking-schedule.error';
import { RecurrenceOccurrence } from '../../domain/recurrence-rule.helpers';
import { Resource } from '../../domain/resource.aggregate';
import { ScheduleClosure } from '../../domain/schedule-closure.aggregate';
import { ScheduleOpening } from '../../domain/schedule-opening.aggregate';
import { AvailabilityService } from '../../domain/services/availability.service';
import { ResourceOccupancyWindow } from '../ports/resource-occupancy-repository.port';
import { IScheduleClosureRepository } from '../ports/schedule-closure-repository.port';
import { IScheduleOpeningRepository } from '../ports/schedule-opening-repository.port';

// M23-S18 — the working-hours-and-closures half of a recurring schedule's creation-time checks
// (UC-070 step 2). Written as a loader plus one pure in-memory pass so M23-S05's approval step can
// run the identical check again without the request context. The verdict per window is
// AvailabilityService.windowHoursVerdict() — the same rule isWindowFree() (availability) applies —
// so creation and availability can never disagree about what is open.

export interface HoursScheduleData {
  // Tenant-wide AND resource-scoped closures across the term.
  closures: ScheduleClosure[];
  // Tenant-wide openings (resourceId IS NULL).
  tenantOpenings: ScheduleOpening[];
  // Resource-scoped openings for the considered resources.
  resourceOpenings: ScheduleOpening[];
}

export interface HoursScheduleRepos {
  closureRepo: IScheduleClosureRepository;
  openingRepo: IScheduleOpeningRepository;
}

// A fixed number of queries (four) regardless of how many occurrences the term has or how many
// resources are considered: tenant-wide rows via findByTenantAndDateRange (which returns
// tenant-wide records only when resourceId is omitted) and resource-scoped rows via one batched
// call per repository. The four reads run one after another, not in a Promise.all: the caller is
// inside a transaction, where every query shares one connection, and concurrent queries on a
// single pg client are deprecated.
export async function loadHoursScheduleData(
  repos: HoursScheduleRepos,
  tenantId: string,
  resourceIds: string[],
  from: string,
  to: string,
): Promise<HoursScheduleData> {
  const tenantClosures = await repos.closureRepo.findByTenantAndDateRange(tenantId, from, to);
  const resourceClosures = await repos.closureRepo.findByTenantAndResourcesAndDateRange(
    tenantId,
    resourceIds,
    from,
    to,
  );
  const tenantOpenings = await repos.openingRepo.findByTenantAndDateRange(tenantId, from, to);
  const resourceOpenings = await repos.openingRepo.findByTenantAndResourcesAndDateRange(
    tenantId,
    resourceIds,
    from,
    to,
  );
  return {
    closures: [...tenantClosures, ...resourceClosures],
    tenantOpenings,
    resourceOpenings,
  };
}

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
  const lookup = buildDayLookup(input);
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

interface DayLookup {
  closuresByDate: Map<string, ScheduleClosure[]>;
  tenantOpeningByDate: Map<string, ScheduleOpening>;
  resourceOpeningByKey: Map<string, ScheduleOpening>;
}

function buildDayLookup(input: HoursCheckInput): DayLookup {
  return {
    closuresByDate: groupByDate(input.schedule.closures),
    tenantOpeningByDate: new Map(input.schedule.tenantOpenings.map((o) => [o.date.value, o])),
    resourceOpeningByKey: new Map(
      input.schedule.resourceOpenings.map((o) => [`${o.resourceId}|${o.date.value}`, o]),
    ),
  };
}

// One resource's verdict for one occurrence window (start → start + duration + its trailing gap).
function resourceVerdict(
  input: HoursCheckInput,
  lookup: DayLookup,
  occurrence: RecurrenceOccurrence,
  resource: Resource,
): ReturnType<AvailabilityService['windowHoursVerdict']> {
  const date = occurrence.occurrenceStartLocalDate;
  const gapMinutes = input.availabilityService.effectiveFlatGapMinutes(
    input.bufferAfterMinutes,
    resource.turnoverMinutes,
  );
  const start = occurrence.occurrenceStart;
  const end = new Date(start.getTime() + (input.durationMinutes + gapMinutes) * 60_000);
  return input.availabilityService.windowHoursVerdict(
    date,
    input.businessHours,
    {
      resource,
      closures: (lookup.closuresByDate.get(date) ?? []).filter(
        (c) => c.resourceId === null || c.resourceId === resource.id,
      ),
      opening: lookup.tenantOpeningByDate.get(date) ?? null,
      resourceOpening: lookup.resourceOpeningByKey.get(`${resource.id}|${date}`) ?? null,
    },
    { start, end },
  );
}

function groupByDate(closures: ScheduleClosure[]): Map<string, ScheduleClosure[]> {
  const byDate = new Map<string, ScheduleClosure[]>();
  for (const closure of closures) {
    const list = byDate.get(closure.date.value);
    if (list) list.push(closure);
    else byDate.set(closure.date.value, [closure]);
  }
  return byDate;
}
