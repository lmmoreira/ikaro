import { AvailabilityService } from '../../domain/services/availability.service';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { IResourceRepository } from '../ports/resource-repository.port';

// Shared by every candidate start time of one availability calculation (and, for a summary, every
// day of it): a requirement's candidate set and each resource row are tenant-wide facts that don't
// change between slots, so they are loaded once — as promises, so slots evaluated concurrently
// share one in-flight load instead of each issuing their own.
export interface WindowResolutionContext {
  resourceRepo: IResourceRepository;
  availabilityService: AvailabilityService;
  tenantId: string;
  resourceCache: Map<string, Promise<Resource | null>>;
  candidateCache: Map<string, Promise<Resource[]>>;
}

export function createWindowResolutionContext(
  resourceRepo: IResourceRepository,
  availabilityService: AvailabilityService,
  tenantId: string,
): WindowResolutionContext {
  return {
    resourceRepo,
    availabilityService,
    tenantId,
    resourceCache: new Map(),
    candidateCache: new Map(),
  };
}

// `pinned` is the customer's already-validated CUSTOMER_CHOICE pick(s) for this requirement
// (availability-lines.helpers.ts) — when present they ARE the candidate set, so only the chosen
// resource(s) are consulted; every unpinned requirement keeps the union of its eligible candidates.
export function resolveActiveCandidates(
  requirement: ResourceRequirement,
  ctx: WindowResolutionContext,
  pinned: Resource[] | undefined,
): Promise<Resource[]> {
  if (pinned) return Promise.resolve(pinned);
  const key = `${requirement.type}|${(requirement.resourcePoolIds ?? []).join(',')}`;
  let candidates = ctx.candidateCache.get(key);
  if (!candidates) {
    candidates = loadActiveCandidates(requirement, ctx);
    ctx.candidateCache.set(key, candidates);
  }
  return candidates;
}

async function loadActiveCandidates(
  requirement: ResourceRequirement,
  ctx: WindowResolutionContext,
): Promise<Resource[]> {
  if (requirement.resourcePoolIds?.length) {
    const found = await Promise.all(
      requirement.resourcePoolIds.map((id) => lookupActiveResource(id, requirement, ctx)),
    );
    return found.flat();
  }
  const active = await ctx.resourceRepo.findByTenant(ctx.tenantId, {
    type: requirement.type,
    isActive: true,
  });
  for (const resource of active) {
    ctx.resourceCache.set(resource.id, Promise.resolve(resource));
  }
  return active;
}

async function lookupActiveResource(
  id: string,
  requirement: ResourceRequirement,
  ctx: WindowResolutionContext,
): Promise<Resource[]> {
  let pending = ctx.resourceCache.get(id);
  if (!pending) {
    pending = ctx.resourceRepo.findById(id, ctx.tenantId);
    ctx.resourceCache.set(id, pending);
  }
  const found = await pending;
  // A resourcePoolIds member that's since been deactivated, deleted, or had its type changed away
  // from the requirement's type (UpdateResourceUseCase permits this for non-LOCATION resources —
  // plan/M21-MULTIVERTICAL-FOUNDATION.md's UpdateResourceUseCase spec only rejects a type change
  // to/from LOCATION) is silently excluded here (not a BookingServiceResourceTypeUnavailableError
  // like the write path) — read-path availability degrades that one candidate out of its union,
  // it doesn't fail the whole check.
  if (!found?.isActive || found.type !== requirement.type) return [];
  return [found];
}
