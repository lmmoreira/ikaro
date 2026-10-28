import { utcDateToLocalDate } from '../../../../shared/utils/calendar-date';
import { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import {
  BookingOutsideBusinessHoursError,
  BookingSlotClosedError,
} from '../../domain/errors/booking-domain.error';
import { Resource } from '../../domain/resource.aggregate';
import {
  AvailabilityService,
  WindowHoursVerdict,
} from '../../domain/services/availability.service';
import { ResourceOccupancyCandidate } from '../ports/resource-occupancy-repository.port';
import { IScheduleClosureRepository } from '../ports/schedule-closure-repository.port';
import { IScheduleOpeningRepository } from '../ports/schedule-opening-repository.port';
import {
  buildHoursDayLookup,
  HoursDayLookup,
  HoursScheduleRepos,
  loadHoursScheduleData,
  resourceWindowHoursVerdict,
} from './schedule-hours.helpers';

// What a booking-creating use case's input carries from the tenant's settings: its working hours,
// and the serviceBufferMinutes a service with a null buffer inherits (TD51-S00).
export interface BookingHoursRequest {
  businessHours: BusinessHours;
  tenantServiceBufferMinutes: number;
}

// What a booking-creating caller hands to the resource resolution so it can steer the pick
// toward resources that are open and refuse the ones that are not. Absent = today's behavior.
export interface HoursSource {
  repos: HoursScheduleRepos;
  businessHours: BusinessHours;
}

// A source with its closures and openings loaded: built once per resolution, inside the caller's
// transaction, after the resource lock step.
export interface HoursGate {
  availabilityService: AvailabilityService;
  businessHours: BusinessHours;
  lookup: HoursDayLookup;
}

// A window can run past local midnight (a long service, a trailing buffer); one extra day of
// closures and openings is cheap to read and removes any chance of a window starting on a day
// that was never loaded.
const SPAN_MARGIN_MINUTES = 24 * 60;

export interface LoadHoursGateParams {
  source: HoursSource;
  availabilityService: AvailabilityService;
  tenantId: string;
  resourceIds: string[];
  scheduledAt: Date;
  totalDurationMinutes: number;
}

export async function loadHoursGate(params: LoadHoursGateParams): Promise<HoursGate> {
  const { source, availabilityService, tenantId, resourceIds, scheduledAt } = params;
  const { timezone } = source.businessHours;
  const end = new Date(
    scheduledAt.getTime() + (params.totalDurationMinutes + SPAN_MARGIN_MINUTES) * 60_000,
  );
  const schedule = await loadHoursScheduleData(
    source.repos,
    tenantId,
    resourceIds,
    utcDateToLocalDate(scheduledAt, timezone),
    utcDateToLocalDate(end, timezone),
  );
  return {
    availabilityService,
    businessHours: source.businessHours,
    lookup: buildHoursDayLookup(schedule),
  };
}

export function gateVerdict(
  gate: HoursGate,
  resource: Resource,
  window: { start: Date; end: Date },
): WindowHoursVerdict {
  return resourceWindowHoursVerdict({
    availabilityService: gate.availabilityService,
    businessHours: gate.businessHours,
    lookup: gate.lookup,
    resource,
    window,
  });
}

// Every chosen candidate must be open over its own window (trailing buffer and turnover included),
// the same per-window rule availability applies. The first refusing candidate, in candidate order,
// names the reason.
export function assertCandidatesWithinHours(
  gate: HoursGate,
  candidates: ResourceOccupancyCandidate[],
  resources: ReadonlyMap<string, Resource>,
): void {
  for (const candidate of candidates) {
    const verdict = gateVerdict(gate, resources.get(candidate.resourceId)!, {
      start: candidate.startsAt,
      end: candidate.endsAt,
    });
    if (verdict === 'CLOSED') throw new BookingSlotClosedError();
    if (verdict === 'OUTSIDE_HOURS') throw new BookingOutsideBusinessHoursError();
  }
}

export function toHoursSource(
  closureRepo: IScheduleClosureRepository,
  openingRepo: IScheduleOpeningRepository,
  businessHours: BusinessHours,
): HoursSource {
  return { repos: { closureRepo, openingRepo }, businessHours };
}
