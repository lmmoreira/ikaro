import {
  BookingServiceNotInTenantError,
  BookingServiceResourceTypeUnavailableError,
} from '../../domain/errors/booking-domain.error';
import { AvailabilityService } from '../../domain/services/availability.service';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { Service } from '../../domain/service.aggregate';
import { ServiceLeg } from '../../domain/service-leg';
import { ResourceOccupancyCandidate } from '../ports/resource-occupancy-repository.port';
import { IResourceRepository } from '../ports/resource-repository.port';
import { isDegenerateService } from './availability-resource-scope.helpers';

// isDegenerate carries isDegenerateService()'s verdict through to assignment time — see
// resource-occupancy-assignment.helpers.ts's effectiveLockState() for why.
export interface ResolvedLineCandidates {
  candidates: ResourceOccupancyCandidate[];
  isDegenerate: boolean;
}

export interface BookingLineForResolution {
  lineId: string;
  serviceId: string;
  durationMinsAtBooking: number;
}

interface ResolutionContext {
  resourceRepo: IResourceRepository;
  availabilityService: AvailabilityService;
  tenantId: string;
  resourceCache: Map<string, Resource>;
}

interface PerLegResource {
  legIndex: number;
  resource: Resource;
  quantityPosition: number | null;
}

// Resolves every booking line's service resourceRequirements/legs into concrete
// ResourceOccupancyCandidate rows (docs/13-DATABASE_SCHEMA.md § booking_line_resource_assignments
// / resource_occupancy), one per (line, leg?, requirement, quantity unit).
//
// Deterministic pool pick: when a requirement has more than one active candidate (a fungible
// pool / AUTO_ANY with no resourcePoolIds restriction), this always picks the first N (N =
// requiredQuantity) — it does not retry a different pool member on conflict. True "pick whichever
// pool member is actually free" resolution is real M23 booking-flow scope (a customer/staff
// selection UI); Non-Goals excludes any customer-facing resource-scoped booking flow change in
// M22. The GIST exclusion constraint + BookingSlotConflictService's pre-check still fully protect
// this deterministic pick from double-booking — a busy first pick is correctly rejected, it's
// just not auto-retried against a sibling pool member yet.
//
// Multiple lines are sequential and back-to-back within the booking's own combined window,
// matching today's Booking.totalDurationMins model (byte-identical for the degenerate case) — the
// UC-059 buffer/turnover gap is applied once, at the very end of the LAST line only, never
// between two lines of the same booking.
export async function resolveBookingLinesResourceCandidates(
  resourceRepo: IResourceRepository,
  availabilityService: AvailabilityService,
  tenantId: string,
  scheduledAt: Date,
  lines: BookingLineForResolution[],
  serviceMap: Map<string, Service>,
): Promise<Map<string, ResolvedLineCandidates>> {
  const ctx: ResolutionContext = {
    resourceRepo,
    availabilityService,
    tenantId,
    resourceCache: new Map(),
  };
  const result = new Map<string, ResolvedLineCandidates>();
  let cursor = scheduledAt;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const service = serviceMap.get(line.serviceId);
    if (!service) throw new BookingServiceNotInTenantError(line.serviceId);
    const isLastLine = i === lines.length - 1;
    const lineStart = cursor;
    const lineEnd = new Date(cursor.getTime() + line.durationMinsAtBooking * 60_000);

    const candidates = service.legs
      ? await resolveLeggedLineCandidates(service, ctx, lineStart)
      : await resolveFlatLineCandidates(service, ctx, lineStart, lineEnd, isLastLine);

    result.set(line.lineId, { candidates, isDegenerate: isDegenerateService(service) });
    cursor = lineEnd;
  }

  return result;
}

// A service with zero resourceRequirements (every service starts this way — CreateServiceUseCase
// never defaults them; a manager opts in via a separate PATCH) has nothing configured to scope
// by, so it falls back to the tenant's LOCATION resource — same degenerate-service reasoning as
// availability-resource-scope.helpers.ts's isDegenerateService(), applied here on the write path
// so a not-yet-configured service still gets real exclusivity protection instead of none at all.
const DEGENERATE_LOCATION_REQUIREMENT = ResourceRequirement.create({
  type: ResourceType.LOCATION,
  selectionMode: 'NONE',
});

async function resolveFlatLineCandidates(
  service: Service,
  ctx: ResolutionContext,
  lineStart: Date,
  lineEnd: Date,
  isLastLine: boolean,
): Promise<ResourceOccupancyCandidate[]> {
  const requirements =
    service.resourceRequirements.length > 0
      ? service.resourceRequirements
      : [DEGENERATE_LOCATION_REQUIREMENT];
  const candidates: ResourceOccupancyCandidate[] = [];
  for (const requirement of requirements) {
    const resources = await resolveRequirementResources(requirement, ctx);
    resources.forEach((resource, index) => {
      const gap = isLastLine
        ? ctx.availabilityService.effectiveFlatGapMinutes(
            service.bufferAfterMinutes ?? 0,
            resource.turnoverMinutes,
          )
        : 0;
      candidates.push({
        resourceId: resource.id,
        resourceType: resource.type,
        resourceName: resource.name,
        legIndex: null,
        quantityPosition: resources.length > 1 ? index : null,
        startsAt: lineStart,
        endsAt: new Date(lineEnd.getTime() + gap * 60_000),
      });
    });
  }
  return candidates;
}

// computeLegSpans's turnover param only extends a leg's OWN endsAtWithTurnover — it never affects
// the next leg's startsAt (that's transitionGapAfterMinutes alone, a static per-leg service
// value). So turnover is entirely per-resource and per-leg-sequencing-independent: spans are
// computed once with zero turnover, then each candidate adds its OWN resource's turnoverMinutes
// to that raw leg end — never a pool-wide max applied uniformly to every candidate regardless of
// which one actually ends up free.
const NO_TURNOVER = new Map<number, number>();

async function resolveLeggedLineCandidates(
  service: Service,
  ctx: ResolutionContext,
  lineStart: Date,
): Promise<ResourceOccupancyCandidate[]> {
  const legs = service.legs!;
  const perLeg = await resolvePerLegResources(legs, ctx);
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

  return perLeg.map(({ legIndex, resource, quantityPosition }) => {
    const span = spanByLegIndex.get(legIndex)!;
    return {
      resourceId: resource.id,
      resourceType: resource.type,
      resourceName: resource.name,
      legIndex,
      quantityPosition,
      startsAt: span.startsAt,
      endsAt: new Date(span.endsAtWithTurnover.getTime() + resource.turnoverMinutes * 60_000),
    };
  });
}

async function resolvePerLegResources(
  legs: ServiceLeg[],
  ctx: ResolutionContext,
): Promise<PerLegResource[]> {
  const perLeg: PerLegResource[] = [];
  for (const leg of legs) {
    for (const requirement of leg.resourceRequirements) {
      const resources = await resolveRequirementResources(requirement, ctx);
      resources.forEach((resource, index) => {
        perLeg.push({
          legIndex: leg.legIndex,
          resource,
          quantityPosition: resources.length > 1 ? index : null,
        });
      });
    }
  }
  return perLeg;
}

async function resolveRequirementResources(
  requirement: ResourceRequirement,
  ctx: ResolutionContext,
): Promise<Resource[]> {
  const candidateIds = await resolveCandidateIds(requirement, ctx);
  if (candidateIds.length < requirement.requiredQuantity) {
    throw new BookingServiceResourceTypeUnavailableError(requirement.type);
  }

  const chosenIds = candidateIds.slice(0, requirement.requiredQuantity);
  const resources: Resource[] = [];
  for (const id of chosenIds) {
    resources.push(await lookupResource(id, requirement, ctx));
  }
  return resources;
}

async function resolveCandidateIds(
  requirement: ResourceRequirement,
  ctx: ResolutionContext,
): Promise<string[]> {
  if (requirement.resourcePoolIds && requirement.resourcePoolIds.length > 0) {
    return requirement.resourcePoolIds;
  }
  const active = await ctx.resourceRepo.findByTenant(ctx.tenantId, {
    type: requirement.type,
    isActive: true,
  });
  if (active.length === 0) {
    throw new BookingServiceResourceTypeUnavailableError(requirement.type);
  }
  return active.map((r) => r.id);
}

async function lookupResource(
  id: string,
  requirement: ResourceRequirement,
  ctx: ResolutionContext,
): Promise<Resource> {
  const cached = ctx.resourceCache.get(id);
  if (cached) return cached;
  const found = await ctx.resourceRepo.findById(id, ctx.tenantId);
  // Enforced here (not just at the findByTenant(isActive: true) call site) because a fixed
  // resourcePoolIds requirement trusts its configured ids directly, bypassing that filter — a
  // resource deactivated after a service was configured must not still be assignable. The type
  // check guards the same trust: UpdateResourceUseCase permits changing a non-LOCATION resource's
  // type after it was pinned into a requirement's resourcePoolIds (plan/M21-MULTIVERTICAL-
  // FOUNDATION.md's UpdateResourceUseCase spec only rejects a type change to/from LOCATION), so a
  // stale pool id could otherwise resolve to a resource of the wrong type.
  if (!found?.isActive || found.type !== requirement.type) {
    throw new BookingServiceResourceTypeUnavailableError(requirement.type);
  }
  ctx.resourceCache.set(id, found);
  return found;
}
