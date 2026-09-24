import { localDateRangeBoundsUTC, todayUTC } from '../../../../shared/utils/calendar-date';
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
import { calculateResourceScopedAvailability } from './resource-scoped-availability.helpers';

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
  const dayClosures = ctx.closures.filter((c) => c.date.value === date);
  const dayTenantOpening = ctx.tenantOpenings.find((o) => o.date.value === date) ?? null;
  const dayResourceOpening = ctx.resourceOpenings.find((o) => o.date.value === date) ?? null;
  const dayBoundsUTC = localDateRangeBoundsUTC(date, date, ctx.businessHours.timezone);
  const dayOccupancy = ctx.occupancy.filter(
    (o) => o.startsAt < dayBoundsUTC.end && o.endsAt > dayBoundsUTC.start,
  );

  return availabilityService.calculate({
    date,
    services: ctx.services.map((s) => ({ durationMinutes: s.durationMinutes })),
    businessHours: ctx.businessHours,
    resource: ctx.resource,
    slotGranularityMinutes: ctx.slotGranularityMinutes,
    // Only the last requested service's own buffer applies (matching
    // effectiveFlatGapMinutes's last-line-only rule everywhere else) — the tenant default is
    // only a fallback for a service with no override.
    serviceBufferMinutes: ctx.services.at(-1)!.bufferAfterMinutes ?? ctx.serviceBufferMinutes,
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

interface ResourceRangeData {
  resource: Resource | null;
  scheduleRange: ScheduleRangeContext;
  occupancy: ResourceOccupiedSlot[];
}

const TENANT_WIDE_CACHE_KEY = '__TENANT_WIDE__';

// UC-058/059 resource-scoped path — same shared per-line/per-leg window resolution as
// GetAvailabilityUseCase (resource-scoped-availability.helpers.ts), applied once per day across
// the whole requested range. Each distinct resourceId referenced across the whole range (not just
// within a single day) is fetched at most once — a naive per-day fetch would turn an N-day,
// M-resource summary into O(N×M) schedule/occupancy queries for data that's identical work fetched
// once for the whole [from, to] range and then sliced per day in memory.
export async function buildResourceScopedSummary(
  deps: SummaryDeps,
  request: SummaryRequestShape,
  tenantId: string,
  services: Service[],
): Promise<DaySummary[]> {
  const today = todayUTC();
  const results: DaySummary[] = [];
  const rangeCache = new Map<string, Promise<ResourceRangeData>>();

  const loadRangeData = makeRangeDataLoader(deps, tenantId, request, rangeCache);

  for (const date of dateRange(request.from, request.to)) {
    if (date < today) {
      results.push({ date, available: false, slotCount: 0 });
      continue;
    }
    const slots = await calculateResourceScopedAvailability(
      {
        resourceRepo: deps.resourceRepo,
        availabilityService: deps.availabilityService,
        loadScheduleContext: (resourceId) =>
          sliceScheduleContextForDate(loadRangeData, resourceId, date),
        loadOccupancy: async (resourceId) => (await loadRangeData(resourceId)).occupancy,
      },
      {
        tenantId,
        date,
        businessHours: request.businessHours,
        slotGranularityMinutes: request.slotGranularityMinutes,
        serviceBufferMinutes: request.serviceBufferMinutes,
      },
      services,
    );
    results.push({ date, available: slots.length > 0, slotCount: slots.length });
  }

  return results;
}

function makeRangeDataLoader(
  deps: SummaryDeps,
  tenantId: string,
  request: SummaryRequestShape,
  rangeCache: Map<string, Promise<ResourceRangeData>>,
): (resourceId: string | undefined) => Promise<ResourceRangeData> {
  return (resourceId) => {
    const cacheKey = resourceId ?? TENANT_WIDE_CACHE_KEY;
    let cached = rangeCache.get(cacheKey);
    if (!cached) {
      cached = loadResourceRangeData(deps, tenantId, request, resourceId);
      rangeCache.set(cacheKey, cached);
    }
    return cached;
  };
}

async function sliceScheduleContextForDate(
  loadRangeData: (resourceId: string | undefined) => Promise<ResourceRangeData>,
  resourceId: string | undefined,
  date: string,
): Promise<{
  resource: Resource | null;
  closures: ScheduleRangeContext['closures'];
  tenantOpening: ScheduleRangeContext['tenantOpenings'][number] | null;
  resourceOpening: ScheduleRangeContext['resourceOpenings'][number] | null;
}> {
  const data = await loadRangeData(resourceId);
  return {
    resource: data.resource,
    closures: data.scheduleRange.closures.filter((c) => c.date.value === date),
    tenantOpening: data.scheduleRange.tenantOpenings.find((o) => o.date.value === date) ?? null,
    resourceOpening: data.scheduleRange.resourceOpenings.find((o) => o.date.value === date) ?? null,
  };
}

async function loadResourceRangeData(
  deps: SummaryDeps,
  tenantId: string,
  request: SummaryRequestShape,
  resourceId: string | undefined,
): Promise<ResourceRangeData> {
  const [resource, scheduleRange, occupancy] = await Promise.all([
    findResource(deps.resourceRepo, tenantId, resourceId),
    loadScheduleRange(deps, tenantId, request.from, request.to, resourceId),
    resourceId != null
      ? deps.bookingPort.findOccupancyByTenantAndResource(
          tenantId,
          [resourceId],
          request.from,
          request.to,
          request.businessHours.timezone,
        )
      : Promise.resolve([]),
  ]);
  return { resource, scheduleRange, occupancy };
}
