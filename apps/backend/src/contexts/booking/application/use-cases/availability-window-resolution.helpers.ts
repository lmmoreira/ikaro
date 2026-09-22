import type { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import { AvailabilityService } from '../../domain/services/availability.service';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceOccupiedSlot } from '../../domain/resource-occupied-slot';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { ScheduleClosure } from '../../domain/schedule-closure.aggregate';
import { ScheduleOpening } from '../../domain/schedule-opening.aggregate';
import { Service } from '../../domain/service.aggregate';
import { ServiceLeg } from '../../domain/service-leg';
import { IResourceRepository } from '../ports/resource-repository.port';

export interface RequirementWindowCandidate {
  resourceId: string;
  startsAt: Date;
  endsAt: Date; // buffer/turnover already applied where relevant
  // How many distinct candidates from this same requirement must be simultaneously free — every
  // candidate in one RequirementWindowEntry shares its own requirement's value (denormalized here
  // rather than wrapping the array, so existing entry[i]/…map(c => c.resourceId) call sites don't
  // need reshaping). 1 for the ordinary single-resource case.
  requiredQuantity: number;
}

// One requirement's full candidate set for one specific line/leg — every active resource of the
// requirement's type (or its resourcePoolIds), each with its own concrete window (turnover can
// differ per candidate, so the window itself can differ even within one requirement). Empty means
// this requirement has no free-to-consider candidate at all.
export type RequirementWindowEntry = RequirementWindowCandidate[];

interface WindowResolutionContext {
  resourceRepo: IResourceRepository;
  availabilityService: AvailabilityService;
  tenantId: string;
  resourceCache: Map<string, Resource>;
}

const DEGENERATE_LOCATION_REQUIREMENT = ResourceRequirement.create({
  type: ResourceType.LOCATION,
  selectionMode: 'NONE',
});

// Read-path counterpart to resource-occupancy.helpers.ts's resolveBookingLinesResourceCandidates
// — same cursor-based sequential-line / computeLegSpans leg-window math, but returns EVERY active
// candidate per requirement instead of deterministically picking one, so the caller can union
// across pool members (UC-058) rather than committing to a single pick the way the write path
// does. Never throws on a requirement with zero candidates — an empty RequirementWindowEntry is
// handled by the caller's own union/intersect combinators like any other "no match."
export async function resolveAvailabilityRequirementWindows(
  resourceRepo: IResourceRepository,
  availabilityService: AvailabilityService,
  tenantId: string,
  candidateStart: Date,
  services: Service[],
): Promise<RequirementWindowEntry[]> {
  const ctx: WindowResolutionContext = {
    resourceRepo,
    availabilityService,
    tenantId,
    resourceCache: new Map(),
  };
  const entries: RequirementWindowEntry[] = [];
  let cursor = candidateStart;

  for (let i = 0; i < services.length; i++) {
    const service = services[i];
    const isLastLine = i === services.length - 1;
    const lineStart = cursor;
    const lineEnd = new Date(cursor.getTime() + service.durationMinutes * 60_000);

    if (service.legs) {
      entries.push(...(await resolveLeggedWindows(service, ctx, lineStart)));
    } else {
      entries.push(...(await resolveFlatWindows(service, ctx, lineStart, lineEnd, isLastLine)));
    }
    cursor = lineEnd;
  }

  return entries;
}

async function resolveFlatWindows(
  service: Service,
  ctx: WindowResolutionContext,
  lineStart: Date,
  lineEnd: Date,
  isLastLine: boolean,
): Promise<RequirementWindowEntry[]> {
  const requirements =
    service.resourceRequirements.length > 0
      ? service.resourceRequirements
      : [DEGENERATE_LOCATION_REQUIREMENT];
  const entries: RequirementWindowEntry[] = [];
  for (const requirement of requirements) {
    const resources = await resolveActiveCandidates(requirement, ctx);
    entries.push(
      resources.map((resource) => {
        const gap = isLastLine
          ? ctx.availabilityService.effectiveFlatGapMinutes(
              service.bufferAfterMinutes ?? 0,
              resource.turnoverMinutes,
            )
          : 0;
        return {
          resourceId: resource.id,
          startsAt: lineStart,
          endsAt: new Date(lineEnd.getTime() + gap * 60_000),
          requiredQuantity: requirement.requiredQuantity,
        };
      }),
    );
  }
  return entries;
}

// Same shape as resource-occupancy.helpers.ts's resolveLeggedLineCandidates: computeLegSpans's
// turnover param only extends a leg's OWN endsAtWithTurnover, never the next leg's startsAt
// (that's transitionGapAfterMinutes alone, a static per-leg service value) — so spans are computed
// once with zero turnover, then each candidate adds its OWN resource's turnoverMinutes to that raw
// leg end, never a pool-wide max applied uniformly regardless of which candidate ends up free.
const NO_TURNOVER = new Map<number, number>();

interface PerLegCandidates {
  legIndex: number;
  resources: Resource[];
  requiredQuantity: number;
}

async function resolvePerLegCandidates(
  legs: ServiceLeg[],
  ctx: WindowResolutionContext,
): Promise<PerLegCandidates[]> {
  const perLeg: PerLegCandidates[] = [];
  for (const leg of legs) {
    for (const requirement of leg.resourceRequirements) {
      perLeg.push({
        legIndex: leg.legIndex,
        resources: await resolveActiveCandidates(requirement, ctx),
        requiredQuantity: requirement.requiredQuantity,
      });
    }
  }
  return perLeg;
}

async function resolveLeggedWindows(
  service: Service,
  ctx: WindowResolutionContext,
  lineStart: Date,
): Promise<RequirementWindowEntry[]> {
  const legs = service.legs!;
  const perLeg = await resolvePerLegCandidates(legs, ctx);

  const legSpans = ctx.availabilityService.computeLegSpans(
    lineStart,
    legs.map((leg) => ({
      legIndex: leg.legIndex,
      durationMinutes: leg.durationMinutes,
      transitionGapAfterMinutes: leg.transitionGapAfterMinutes,
    })),
    NO_TURNOVER,
  );
  const spanByLegIndex = new Map(legSpans.map((span) => [span.legIndex, span]));

  return perLeg.map(({ legIndex, resources, requiredQuantity }) => {
    const span = spanByLegIndex.get(legIndex)!;
    return resources.map((resource) => ({
      resourceId: resource.id,
      startsAt: span.startsAt,
      endsAt: new Date(span.endsAtWithTurnover.getTime() + resource.turnoverMinutes * 60_000),
      requiredQuantity,
    }));
  });
}

async function resolveActiveCandidates(
  requirement: ResourceRequirement,
  ctx: WindowResolutionContext,
): Promise<Resource[]> {
  const candidateIds =
    requirement.resourcePoolIds && requirement.resourcePoolIds.length > 0
      ? requirement.resourcePoolIds
      : (
          await ctx.resourceRepo.findByTenant(ctx.tenantId, {
            type: requirement.type,
            isActive: true,
          })
        ).map((r) => r.id);

  const resources: Resource[] = [];
  for (const id of candidateIds) {
    resources.push(...(await lookupActiveResource(id, requirement, ctx)));
  }
  return resources;
}

async function lookupActiveResource(
  id: string,
  requirement: ResourceRequirement,
  ctx: WindowResolutionContext,
): Promise<Resource[]> {
  const cached = ctx.resourceCache.get(id);
  if (cached) return cached.type === requirement.type ? [cached] : [];
  const found = await ctx.resourceRepo.findById(id, ctx.tenantId);
  // A resourcePoolIds member that's since been deactivated, deleted, or had its type changed away
  // from the requirement's type (UpdateResourceUseCase permits this for non-LOCATION resources —
  // plan/M21-MULTIVERTICAL-FOUNDATION.md's UpdateResourceUseCase spec only rejects a type change
  // to/from LOCATION) is silently excluded here (not a BookingServiceResourceTypeUnavailableError
  // like the write path) — read-path availability degrades that one candidate out of its union,
  // it doesn't fail the whole check.
  if (!found?.isActive || found.type !== requirement.type) return [];
  ctx.resourceCache.set(id, found);
  return [found];
}

export interface ResourceAvailabilityContext {
  resource: Resource | null;
  closures: ScheduleClosure[];
  tenantOpening: ScheduleOpening | null;
  resourceOpening: ScheduleOpening | null;
  occupancy: ResourceOccupiedSlot[];
}

export interface ResourceScopedAvailabilityDeps {
  resourceRepo: IResourceRepository;
  availabilityService: AvailabilityService;
  tenantId: string;
  date: string;
  businessHours: BusinessHours;
  loadResourceContext: (resourceId: string) => Promise<ResourceAvailabilityContext>;
}

// One candidate start time's full UC-058 intersect(union(...)) check across every line/leg's
// requirement windows. `contextCache` is owned by the caller and shared across every candidate
// start time in a day's search — each resource's own schedule/occupancy is constant for the
// whole day, so caching bounds I/O by unique resourceIds referenced, not by
// (candidateStarts × entries × candidates).
export async function isBookingWindowAvailable(
  deps: ResourceScopedAvailabilityDeps,
  services: Service[],
  candidateStart: Date,
  contextCache: Map<string, ResourceAvailabilityContext>,
): Promise<boolean> {
  const entries = await resolveAvailabilityRequirementWindows(
    deps.resourceRepo,
    deps.availabilityService,
    deps.tenantId,
    candidateStart,
    services,
  );
  for (const entry of entries) {
    if (!(await enoughCandidatesFree(deps, entry, contextCache))) return false;
  }
  return true;
}

// A fungible requirement's requiredQuantity > 1 needs that many DISTINCT candidates
// simultaneously free, not just one — the write path resolves exactly requiredQuantity resources
// per requirement (resource-occupancy.helpers.ts's resolveRequirementResources), so a read-path
// "available" verdict backed by only one free member would let a customer pick a slot the write
// path then can't actually fulfil.
async function enoughCandidatesFree(
  deps: ResourceScopedAvailabilityDeps,
  candidates: RequirementWindowEntry,
  cache: Map<string, ResourceAvailabilityContext>,
): Promise<boolean> {
  if (candidates.length === 0) return false;
  let freeCount = 0;
  for (const candidate of candidates) {
    let ctx = cache.get(candidate.resourceId);
    if (!ctx) {
      ctx = await deps.loadResourceContext(candidate.resourceId);
      cache.set(candidate.resourceId, ctx);
    }
    const free = deps.availabilityService.isWindowFree(
      deps.date,
      deps.businessHours,
      {
        resource: ctx.resource,
        closures: ctx.closures,
        opening: ctx.tenantOpening,
        resourceOpening: ctx.resourceOpening,
      },
      { start: candidate.startsAt, end: candidate.endsAt },
      ctx.occupancy,
    );
    if (free) freeCount += 1;
    if (freeCount >= candidate.requiredQuantity) return true;
  }
  return false;
}
