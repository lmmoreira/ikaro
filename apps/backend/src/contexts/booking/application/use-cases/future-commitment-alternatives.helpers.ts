import { Booking } from '../../domain/booking.aggregate';
import {
  ResourceRequirement,
  ResourceRequirementSelectionMode,
} from '../../domain/resource-requirement';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceType } from '../../domain/resource.types';
import { Service } from '../../domain/service.aggregate';
import { FutureCommitmentAlternative } from '../../domain/future-commitment-exception.types';
import {
  IResourceOccupancyRepository,
  ResourceBookingImpact,
  ResourceOccupancyWindow,
} from '../ports/resource-occupancy-repository.port';
import { IResourceRepository } from '../ports/resource-repository.port';
import { IServiceRepository } from '../ports/service-repository.port';

export interface TimeWindow {
  startsAt: Date;
  endsAt: Date;
}

// The requirement of `service` that a resource of `type` satisfied for one booking line — the
// service's flat requirement, or the named leg's. Null when the service no longer declares one
// for that type (the configuration changed since the booking was made).
export function findRequirementForAssignment(
  service: Service | undefined,
  legIndex: number | null,
  type: ResourceType,
): ResourceRequirement | null {
  if (!service) return null;
  const requirements =
    legIndex === null
      ? service.resourceRequirements
      : (service.legs?.find((leg) => leg.legIndex === legIndex)?.resourceRequirements ?? []);
  return requirements.find((r) => r.type === type) ?? null;
}

// UC-062/063 — a customer sees a resource's identity only when its requirement lets them choose it
// or shows the automatic pick. A fungible pool (AUTO_FUNGIBLE_POOL), NONE, or a requirement the
// service no longer declares (null) keeps it hidden; a booking discloses it only when every
// affected assignment does.
const DISCLOSING_SELECTION_MODES: ReadonlySet<ResourceRequirementSelectionMode> = new Set([
  'CUSTOMER_CHOICE',
  'AUTO_ANY',
]);

export function requirementsDiscloseResource(
  requirements: (ResourceRequirement | null)[],
): boolean {
  return requirements.every((r) => r !== null && DISCLOSING_SELECTION_MODES.has(r.selectionMode));
}

// A null/empty pool means "any active resource of the type" — the same convention the resolver
// (resolveEligibleResources) and every other reader of resourcePoolIds uses.
export function isInPool(pool: string[] | null, resourceId: string): boolean {
  return !pool?.length || pool.includes(resourceId);
}

export interface AlternativesRequest {
  key: string;
  windows: TimeWindow[];
  // One entry per affected assignment of the booking on the source resource (its requirement's
  // pool), so a candidate must satisfy every one of them.
  pools: (string[] | null)[];
}

export interface ComputeAlternativesParams {
  occupancyRepo: IResourceOccupancyRepository;
  activeCandidates: Resource[];
  tenantId: string;
  requests: AlternativesRequest[];
}

// Advisory alternatives per request: active resources of the same type, inside every affected
// requirement's pool, and free at every one of the request's exact windows — all checked in ONE
// batched conflict query, never one per (booking, candidate). Sorted by name so the list is stable.
export async function computeAlternatives(
  params: ComputeAlternativesParams,
): Promise<Map<string, FutureCommitmentAlternative[]>> {
  const { occupancyRepo, activeCandidates, tenantId, requests } = params;

  const windowsByPair = new Map<string, ResourceOccupancyWindow[]>();
  const allWindows: ResourceOccupancyWindow[] = [];
  for (const request of requests) {
    for (const candidate of eligibleFor(request, activeCandidates)) {
      const windows = request.windows.map((w) => ({
        resourceId: candidate.id,
        startsAt: w.startsAt,
        endsAt: w.endsAt,
      }));
      windowsByPair.set(pairKey(request.key, candidate.id), windows);
      allWindows.push(...windows);
    }
  }

  const conflicting = new Set(await occupancyRepo.findConflictingWindows(tenantId, allWindows));

  const result = new Map<string, FutureCommitmentAlternative[]>();
  for (const request of requests) {
    const free = eligibleFor(request, activeCandidates).filter(
      (candidate) =>
        !(windowsByPair.get(pairKey(request.key, candidate.id)) ?? []).some((w) =>
          conflicting.has(w),
        ),
    );
    result.set(
      request.key,
      free
        .map((candidate) => ({ resourceId: candidate.id, resourceName: candidate.name }))
        .sort((a, b) => a.resourceName.localeCompare(b.resourceName)),
    );
  }
  return result;
}

function eligibleFor(request: AlternativesRequest, candidates: Resource[]): Resource[] {
  return candidates.filter((candidate) =>
    request.pools.every((pool) => isInPool(pool, candidate.id)),
  );
}

function pairKey(requestKey: string, resourceId: string): string {
  return `${requestKey}|${resourceId}`;
}

export interface BookingAlternativesParams {
  tenantId: string;
  // The resource the bookings are being moved off.
  resourceId: string;
  bookings: Booking[];
  // The bookings' live occupancy rows on `resourceId` (every row of every booking in `bookings`).
  impacts: ResourceBookingImpact[];
  serviceRepo: IServiceRepository;
  resourceRepo: IResourceRepository;
  occupancyRepo: IResourceOccupancyRepository;
}

// The compatible, currently free resources for each booking that sits on `resourceId`: the shared
// step of the raise (stored on the entry) and of the worklist read (recomputed on every read, so
// the list reflects a resource reactivated or a slot freed since). Needs an active transaction (the
// occupancy port's contract); the caller owns it.
export async function computeBookingAlternatives(
  params: BookingAlternativesParams,
): Promise<Map<string, FutureCommitmentAlternative[]>> {
  const { tenantId, resourceId, bookings, impacts, serviceRepo, resourceRepo, occupancyRepo } =
    params;
  const type = impacts[0].resourceType;
  const serviceIds = [...new Set(bookings.flatMap((b) => b.lines.map((l) => l.serviceId)))];
  const services = new Map(
    (await serviceRepo.findByIds(serviceIds, tenantId)).map((svc) => [svc.id, svc]),
  );
  const activeCandidates = (
    await resourceRepo.findByTenant(tenantId, { type, isActive: true })
  ).filter((r) => r.id !== resourceId);

  const requests: AlternativesRequest[] = bookings.map((booking) => {
    const rows = impacts.filter((i) => i.bookingId === booking.id);
    const serviceByLine = new Map(booking.lines.map((l) => [l.lineId, l.serviceId]));
    return {
      key: booking.id,
      windows: rows.map((r) => ({ startsAt: r.startsAt, endsAt: r.endsAt })),
      pools: rows.map(
        (r) =>
          findRequirementForAssignment(
            services.get(serviceByLine.get(r.bookingLineId) ?? ''),
            r.legIndex,
            type,
          )?.resourcePoolIds ?? null,
      ),
    };
  });
  return computeAlternatives({ occupancyRepo, activeCandidates, tenantId, requests });
}
