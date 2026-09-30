import { ResourceRequirement } from '../../domain/resource-requirement';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceType } from '../../domain/resource.types';
import { Service } from '../../domain/service.aggregate';
import { FutureCommitmentAlternative } from '../../domain/future-commitment-exception.types';
import {
  IResourceOccupancyRepository,
  ResourceOccupancyWindow,
} from '../ports/resource-occupancy-repository.port';

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
