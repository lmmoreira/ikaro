import {
  BookingInvalidMultipleVariableServicesError,
  BookingServiceResourceTypeUnavailableError,
} from '../../domain/errors/booking-domain.error';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { Service } from '../../domain/service.aggregate';
import { IResourceRepository } from '../ports/resource-repository.port';
import { BookingQuoteService } from '../services/booking-quote.service';
import { isInResourcePool } from './resource-pool.helpers';
import { ResourceSelectionInput } from './resource-occupancy.helpers';
import { selectionKey } from './resource-resolution-context.helpers';

// One requested service as the availability read engine sees it: the quoted duration (equal to
// service.durationMinutes unless the service is CUSTOMER_SELECTED) and the customer's validated
// CUSTOMER_CHOICE picks, keyed by selectionKey(serviceId, legIndex, resourceType) — the same key
// the booking write path groups selections by.
export interface AvailabilityLine {
  service: Service;
  durationMinutes: number;
  pins: Map<string, Resource[]>;
}

export interface AvailabilityLineOverrides {
  resourceSelections?: ResourceSelectionInput[];
  durationMinutes?: number;
}

export interface AvailabilityLineDeps {
  quoteService: BookingQuoteService;
  resourceRepo: IResourceRepository;
}

export function toPlainAvailabilityLines(services: Service[]): AvailabilityLine[] {
  return services.map((service) => ({
    service,
    durationMinutes: service.durationMinutes,
    pins: new Map(),
  }));
}

// Absent both overrides the result is today's exact plain lines (byte-identical availability).
// With either present, every duration/pick is validated against the same rules POST /bookings
// enforces, so an answer of "available" is one the booking itself would accept.
export async function buildAvailabilityLines(
  deps: AvailabilityLineDeps,
  tenantId: string,
  services: Service[],
  overrides: AvailabilityLineOverrides,
): Promise<AvailabilityLine[]> {
  const selections = overrides.resourceSelections ?? [];
  if (selections.length === 0 && overrides.durationMinutes === undefined) {
    return toPlainAvailabilityLines(services);
  }

  const durations = resolveDurations(deps.quoteService, services, overrides.durationMinutes);
  const pinsByServiceId = await resolvePins(deps.resourceRepo, tenantId, services, selections);
  return services.map((service) => ({
    service,
    durationMinutes: durations.get(service.id) ?? service.durationMinutes,
    pins: pinsByServiceId.get(service.id) ?? new Map(),
  }));
}

function resolveDurations(
  quoteService: BookingQuoteService,
  services: Service[],
  durationMinutes: number | undefined,
): Map<string, number> {
  const variable = services.filter(
    (service) => service.bookingPolicy.durationPolicy === 'CUSTOMER_SELECTED',
  );
  if (durationMinutes !== undefined && variable.length > 1) {
    throw new BookingInvalidMultipleVariableServicesError();
  }
  return new Map(
    variable.map((service) => [
      service.id,
      quoteService.quote(service, durationMinutes).durationMinutes,
    ]),
  );
}

interface LocatedRequirement {
  legIndex: number | null;
  requirement: ResourceRequirement;
}

function locateRequirements(service: Service): LocatedRequirement[] {
  if (service.legs) {
    return service.legs.flatMap((leg) =>
      leg.resourceRequirements.map((requirement) => ({ legIndex: leg.legIndex, requirement })),
    );
  }
  return service.resourceRequirements.map((requirement) => ({ legIndex: null, requirement }));
}

// A pick is only meaningful against a CUSTOMER_CHOICE requirement of a requested service — the
// read path is stricter than POST /bookings, which ignores an extraneous entry (its replay of
// existing assignments needs that), because here a silently-ignored pick would show the customer
// availability for a resource they never constrained.
function findPinnableRequirement(
  requirementsByServiceId: Map<string, LocatedRequirement[]>,
  selection: ResourceSelectionInput,
): ResourceRequirement {
  const located = requirementsByServiceId
    .get(selection.serviceId)
    ?.find(
      (candidate) =>
        candidate.legIndex === selection.legIndex &&
        candidate.requirement.type === selection.resourceType &&
        candidate.requirement.selectionMode === 'CUSTOMER_CHOICE',
    );
  if (!located) throw new BookingServiceResourceTypeUnavailableError(selection.resourceType);
  return located.requirement;
}

async function loadPinnableResource(
  resourceRepo: IResourceRepository,
  tenantId: string,
  resourceById: Map<string, Resource>,
  selection: ResourceSelectionInput,
  requirement: ResourceRequirement,
): Promise<Resource> {
  let resource = resourceById.get(selection.resourceId);
  if (!resource) {
    resource = (await resourceRepo.findById(selection.resourceId, tenantId)) ?? undefined;
    if (resource) resourceById.set(resource.id, resource);
  }
  if (
    !resource?.isActive ||
    resource.type !== requirement.type ||
    !isInResourcePool(requirement.resourcePoolIds, resource.id)
  ) {
    throw new BookingServiceResourceTypeUnavailableError(selection.resourceType);
  }
  return resource;
}

async function resolvePins(
  resourceRepo: IResourceRepository,
  tenantId: string,
  services: Service[],
  selections: ResourceSelectionInput[],
): Promise<Map<string, Map<string, Resource[]>>> {
  const requirementsByServiceId = new Map(
    services.map((service) => [service.id, locateRequirements(service)]),
  );
  const resourceById = new Map<string, Resource>();
  const pinsByServiceId = new Map<string, Map<string, Resource[]>>();

  for (const selection of selections) {
    const requirement = findPinnableRequirement(requirementsByServiceId, selection);
    const resource = await loadPinnableResource(
      resourceRepo,
      tenantId,
      resourceById,
      selection,
      requirement,
    );

    const pins = pinsByServiceId.get(selection.serviceId) ?? new Map<string, Resource[]>();
    const key = selectionKey(selection.serviceId, selection.legIndex, selection.resourceType);
    const picked = pins.get(key) ?? [];
    if (!picked.some((existing) => existing.id === resource.id)) picked.push(resource);
    pins.set(key, picked);
    pinsByServiceId.set(selection.serviceId, pins);
  }
  return pinsByServiceId;
}
