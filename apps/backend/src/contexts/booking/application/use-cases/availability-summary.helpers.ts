import { todayUTC } from '../../../../shared/utils/calendar-date';
import type { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import { AvailabilityService, AvailableSlot } from '../../domain/services/availability.service';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceOccupiedSlot } from '../../domain/resource-occupied-slot';
import { Service } from '../../domain/service.aggregate';
import { ResourceNotActiveError, ResourceNotFoundError } from '../../domain/errors/resource.error';
import { IBookingAvailabilityPort } from '../ports/booking-availability.port';
import { IScheduleClosureRepository } from '../ports/schedule-closure-repository.port';
import { IScheduleOpeningRepository } from '../ports/schedule-opening-repository.port';
import { IResourceRepository } from '../ports/resource-repository.port';
import { resolveAvailabilityRequirementEntries } from './availability-resource-scope.helpers';

export interface DaySummary {
  date: string;
  available: boolean;
  slotCount: number;
}

export interface ScheduleRangeContext {
  closures: Awaited<ReturnType<IScheduleClosureRepository['findByTenantAndDateRange']>>;
  tenantOpenings: Awaited<ReturnType<IScheduleOpeningRepository['findByTenantAndDateRange']>>;
  resourceOpenings: Awaited<ReturnType<IScheduleOpeningRepository['findByTenantAndDateRange']>>;
}

export interface SummaryDeps {
  closureRepo: IScheduleClosureRepository;
  openingRepo: IScheduleOpeningRepository;
  resourceRepo: IResourceRepository;
  bookingPort: IBookingAvailabilityPort;
  availabilityService: AvailabilityService;
}

export interface SummaryRequestShape {
  from: string;
  to: string;
  businessHours: BusinessHours;
  slotGranularityMinutes: 15 | 30 | 60;
  serviceBufferMinutes: number;
}

export async function findResource(
  resourceRepo: IResourceRepository,
  tenantId: string,
  resourceId: string | undefined,
): Promise<Resource | null> {
  if (resourceId == null) return null;
  const resource = await resourceRepo.findById(resourceId, tenantId);
  if (!resource) throw new ResourceNotFoundError(resourceId);
  if (!resource.isActive) throw new ResourceNotActiveError(resourceId);
  return resource;
}

// Combines tenant-wide rows (always fetched) with resource-scoped rows (fetched only when
// resourceId is set) — both apply to a resource-scoped availability check.
export async function loadScheduleRange(
  deps: Pick<SummaryDeps, 'closureRepo' | 'openingRepo'>,
  tenantId: string,
  from: string,
  to: string,
  resourceId: string | undefined,
): Promise<ScheduleRangeContext> {
  const [tenantClosures, resourceClosures, tenantOpenings, resourceOpenings] = await Promise.all([
    deps.closureRepo.findByTenantAndDateRange(tenantId, from, to),
    resourceId != null
      ? deps.closureRepo.findByTenantAndDateRange(tenantId, from, to, resourceId)
      : Promise.resolve([]),
    deps.openingRepo.findByTenantAndDateRange(tenantId, from, to),
    resourceId != null
      ? deps.openingRepo.findByTenantAndDateRange(tenantId, from, to, resourceId)
      : Promise.resolve([]),
  ]);
  return {
    closures: [...tenantClosures, ...resourceClosures],
    tenantOpenings,
    resourceOpenings,
  };
}

export function calculateSlotsForDate(
  availabilityService: AvailabilityService,
  date: string,
  ctx: {
    services: Service[];
    resource: Resource | null;
    closures: ScheduleRangeContext['closures'];
    tenantOpenings: ScheduleRangeContext['tenantOpenings'];
    resourceOpenings: ScheduleRangeContext['resourceOpenings'];
    occupancy: ResourceOccupiedSlot[];
    businessHours: BusinessHours;
    slotGranularityMinutes: 15 | 30 | 60;
    serviceBufferMinutes: number;
  },
): AvailableSlot[] {
  const dayClosures = ctx.closures.filter((c) => c.date === date);
  const dayTenantOpening = ctx.tenantOpenings.find((o) => o.date === date) ?? null;
  const dayResourceOpening = ctx.resourceOpenings.find((o) => o.date === date) ?? null;
  const dayOccupancy = ctx.occupancy.filter(
    (o) =>
      o.startsAt < new Date(`${date}T23:59:59.999Z`) &&
      o.endsAt > new Date(`${date}T00:00:00.000Z`),
  );

  return availabilityService.calculate({
    date,
    services: ctx.services.map((s) => ({ durationMinutes: s.durationMinutes })),
    businessHours: ctx.businessHours,
    resource: ctx.resource,
    slotGranularityMinutes: ctx.slotGranularityMinutes,
    serviceBufferMinutes: ctx.serviceBufferMinutes,
    closures: dayClosures,
    opening: dayTenantOpening,
    resourceOpening: dayResourceOpening,
    existingOccupancy: dayOccupancy,
  });
}

export function* dateRange(from: string, to: string): Generator<string> {
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    yield cursor.toISOString().slice(0, 10);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

export function buildDaySummaries(
  availabilityService: AvailabilityService,
  request: SummaryRequestShape,
  services: Service[],
  resource: Resource | null,
  scheduleRange: ScheduleRangeContext,
  occupancy: ResourceOccupiedSlot[],
): DaySummary[] {
  const today = todayUTC();
  const results: DaySummary[] = [];

  for (const date of dateRange(request.from, request.to)) {
    if (date < today) {
      results.push({ date, available: false, slotCount: 0 });
      continue;
    }
    const slots = calculateSlotsForDate(availabilityService, date, {
      services,
      resource,
      ...scheduleRange,
      occupancy,
      businessHours: request.businessHours,
      slotGranularityMinutes: request.slotGranularityMinutes,
      serviceBufferMinutes: request.serviceBufferMinutes,
    });
    results.push({ date, available: slots.length > 0, slotCount: slots.length });
  }

  return results;
}

// UC-058/059 resource-scoped path — same intersect/union combinator as GetAvailabilityUseCase,
// applied once per day across the whole requested range.
export async function buildResourceScopedSummary(
  deps: SummaryDeps,
  request: SummaryRequestShape,
  tenantId: string,
  services: Service[],
): Promise<DaySummary[]> {
  const today = todayUTC();
  const results: DaySummary[] = [];

  for (const date of dateRange(request.from, request.to)) {
    if (date < today) {
      results.push({ date, available: false, slotCount: 0 });
      continue;
    }
    const slots = await computeDayResourceScopedSlots(deps, request, tenantId, services, date);
    results.push({ date, available: slots.length > 0, slotCount: slots.length });
  }

  return results;
}

async function computeDayResourceScopedSlots(
  deps: SummaryDeps,
  request: SummaryRequestShape,
  tenantId: string,
  services: Service[],
  date: string,
): Promise<AvailableSlot[]> {
  let combined: AvailableSlot[] | null = null;
  for (const service of services) {
    const entries = await resolveAvailabilityRequirementEntries(
      service,
      deps.resourceRepo,
      tenantId,
    );
    const entryResults = await Promise.all(
      entries.map((entry) =>
        computeEntryDaySlots(deps, request, tenantId, services, date, entry.candidateResourceIds),
      ),
    );
    const serviceSlots = deps.availabilityService.intersect(entryResults);
    combined =
      combined === null
        ? serviceSlots
        : deps.availabilityService.intersect([combined, serviceSlots]);
  }
  return combined ?? [];
}

async function computeEntryDaySlots(
  deps: SummaryDeps,
  request: SummaryRequestShape,
  tenantId: string,
  services: Service[],
  date: string,
  candidateResourceIds: string[],
): Promise<AvailableSlot[]> {
  const perCandidate = await Promise.all(
    candidateResourceIds.map(async (resourceId) => {
      const resource = await findResource(deps.resourceRepo, tenantId, resourceId);
      const [scheduleRange, occupancy] = await Promise.all([
        loadScheduleRange(deps, tenantId, date, date, resourceId),
        deps.bookingPort.findOccupancyByTenantAndResource(tenantId, [resourceId], date, date),
      ]);
      return calculateSlotsForDate(deps.availabilityService, date, {
        services,
        resource,
        ...scheduleRange,
        occupancy,
        businessHours: request.businessHours,
        slotGranularityMinutes: request.slotGranularityMinutes,
        serviceBufferMinutes: request.serviceBufferMinutes,
      });
    }),
  );
  return deps.availabilityService.union(perCandidate);
}
