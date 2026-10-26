import { utcDateToLocalDate } from '../../../../shared/utils/calendar-date';
import { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import { Resource } from '../../domain/resource.aggregate';
import { ScheduleClosure } from '../../domain/schedule-closure.aggregate';
import { ScheduleOpening } from '../../domain/schedule-opening.aggregate';
import {
  AvailabilityService,
  WindowHoursVerdict,
} from '../../domain/services/availability.service';
import { IScheduleClosureRepository } from '../ports/schedule-closure-repository.port';
import { IScheduleOpeningRepository } from '../ports/schedule-opening-repository.port';

// The working-hours-and-closures half of a creation-time check, shared by the recurring schedule
// (M23-S18, UC-070 step 2) and the one-off booking (TD50). The verdict per window is
// AvailabilityService.windowHoursVerdict() — the same rule isWindowFree() (availability) applies —
// so creation and availability can never disagree about what is open.

export interface HoursScheduleData {
  // Tenant-wide AND resource-scoped closures across the loaded dates.
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

export interface HoursDayLookup {
  closuresByDate: Map<string, ScheduleClosure[]>;
  tenantOpeningByDate: Map<string, ScheduleOpening>;
  resourceOpeningByKey: Map<string, ScheduleOpening>;
}

export function buildHoursDayLookup(schedule: HoursScheduleData): HoursDayLookup {
  return {
    closuresByDate: groupByDate(schedule.closures),
    tenantOpeningByDate: new Map(schedule.tenantOpenings.map((o) => [o.date.value, o])),
    resourceOpeningByKey: new Map(
      schedule.resourceOpenings.map((o) => [`${o.resourceId}|${o.date.value}`, o]),
    ),
  };
}

export interface ResourceWindowHoursInput {
  availabilityService: AvailabilityService;
  businessHours: BusinessHours;
  lookup: HoursDayLookup;
  resource: Resource;
  // The window the resource is occupied for, trailing buffer and turnover included.
  window: { start: Date; end: Date };
}

// One resource's verdict for one window, on the tenant-local day the window starts.
export function resourceWindowHoursVerdict(input: ResourceWindowHoursInput): WindowHoursVerdict {
  const { availabilityService, businessHours, lookup, resource, window } = input;
  const date = utcDateToLocalDate(window.start, businessHours.timezone);
  return availabilityService.windowHoursVerdict(
    date,
    businessHours,
    {
      resource,
      closures: (lookup.closuresByDate.get(date) ?? []).filter(
        (c) => c.resourceId === null || c.resourceId === resource.id,
      ),
      opening: lookup.tenantOpeningByDate.get(date) ?? null,
      resourceOpening: lookup.resourceOpeningByKey.get(`${resource.id}|${date}`) ?? null,
    },
    window,
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
