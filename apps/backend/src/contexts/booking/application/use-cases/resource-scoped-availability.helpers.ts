import type { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import { AvailabilityService, AvailableSlot } from '../../domain/services/availability.service';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceOccupiedSlot } from '../../domain/resource-occupied-slot';
import { ScheduleClosure } from '../../domain/schedule-closure.aggregate';
import { ScheduleOpening } from '../../domain/schedule-opening.aggregate';
import { Service } from '../../domain/service.aggregate';
import { IResourceRepository } from '../ports/resource-repository.port';
import {
  isBookingWindowAvailable,
  ResourceAvailabilityContext,
  ResourceScopedAvailabilityDeps,
} from './availability-window-resolution.helpers';

export interface ResourceScopedAvailabilityRequest {
  tenantId: string;
  date: string;
  businessHours: BusinessHours;
  slotGranularityMinutes: 15 | 30 | 60;
  serviceBufferMinutes: number;
}

export interface ScheduleContextResult {
  resource: Resource | null;
  closures: ScheduleClosure[];
  tenantOpening: ScheduleOpening | null;
  resourceOpening: ScheduleOpening | null;
}

export interface ResourceScopedReadDeps {
  resourceRepo: IResourceRepository;
  availabilityService: AvailabilityService;
  loadScheduleContext: (resourceId: string | undefined) => Promise<ScheduleContextResult>;
  loadOccupancy: (
    resourceId: string,
    date: string,
    timezone: string,
  ) => Promise<ResourceOccupiedSlot[]>;
}

// Shared by both GetAvailabilityUseCase (single day) and the summary use case's per-day loop —
// UC-058/059: resolves every line's (and, for legged services, every leg's) own concrete
// resourceRequirements window relative to each outer candidate start time; a bundle requirement
// is available only when it has a free candidate (intersect across requirements), a fungible pool
// requirement whenever any one candidate is free (union across candidates). The outer candidate
// start times come from one calculate() call with empty occupancy — a pure business-hours/
// closures fit check for the combined total duration, matching exactly what a fresh booking at
// that instant would need to fit within the day.
export async function calculateResourceScopedAvailability(
  deps: ResourceScopedReadDeps,
  request: ResourceScopedAvailabilityRequest,
  services: Service[],
): Promise<AvailableSlot[]> {
  const { closures, tenantOpening } = await deps.loadScheduleContext(undefined);
  // Only the last line's own buffer applies (matching effectiveFlatGapMinutes's last-line-only
  // rule everywhere else) — using the tenant-wide default here instead of a smaller per-service
  // override would inflate this outer fit-check's required span and wrongly hide valid late-day
  // slots. A resource's own turnover isn't known yet at this outer stage (it depends on which
  // candidate resource ends up free) and can only ever require *more* room, never less, so
  // omitting it here is safe: isBookingWindowAvailable's per-candidate check re-verifies the real,
  // resource-specific window against business hours regardless of what this coarse pre-filter let
  // through.
  const lastService = services[services.length - 1];
  const outerBufferMinutes = lastService.bufferAfterMinutes ?? request.serviceBufferMinutes;
  const outerSlots = deps.availabilityService.calculate({
    date: request.date,
    services: services.map((s) => ({ durationMinutes: s.durationMinutes })),
    businessHours: request.businessHours,
    resource: null,
    slotGranularityMinutes: request.slotGranularityMinutes,
    serviceBufferMinutes: outerBufferMinutes,
    closures,
    opening: tenantOpening,
    resourceOpening: null,
    existingOccupancy: [],
  });
  if (outerSlots.length === 0) return [];

  const windowDeps: ResourceScopedAvailabilityDeps = {
    resourceRepo: deps.resourceRepo,
    availabilityService: deps.availabilityService,
    tenantId: request.tenantId,
    date: request.date,
    businessHours: request.businessHours,
    loadResourceContext: (resourceId) => loadResourceAvailabilityContext(deps, request, resourceId),
  };
  const contextCache = new Map<string, ResourceAvailabilityContext>();
  const available: AvailableSlot[] = [];
  for (const slot of outerSlots) {
    const candidateStart = new Date(slot.startsAt);
    if (await isBookingWindowAvailable(windowDeps, services, candidateStart, contextCache)) {
      available.push(slot);
    }
  }
  return available;
}

async function loadResourceAvailabilityContext(
  deps: ResourceScopedReadDeps,
  request: ResourceScopedAvailabilityRequest,
  resourceId: string,
): Promise<ResourceAvailabilityContext> {
  const [{ resource, closures, tenantOpening, resourceOpening }, occupancy] = await Promise.all([
    deps.loadScheduleContext(resourceId),
    deps.loadOccupancy(resourceId, request.date, request.businessHours.timezone),
  ]);
  return { resource, closures, tenantOpening, resourceOpening, occupancy };
}
