import { AvailabilityService } from '../../domain/services/availability.service';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { Service } from '../../domain/service.aggregate';
import { ServiceLeg } from '../../domain/service-leg';
import { ResourceOccupancyCandidate } from '../ports/resource-occupancy-repository.port';
import { resolveRequirementResources } from './resource-requirement-resolution.helpers';
import { ResolutionContext, selectionKey } from './resource-resolution-context.helpers';

// Split out of resource-occupancy.helpers.ts (docs/CODE_STANDARDS.md's file-length limit) — the
// flat vs. legged candidate-building shapes, both ultimately calling
// resource-requirement-resolution.helpers.ts's resolveRequirementResources() per requirement.

interface PerLegResource {
  legIndex: number;
  resource: Resource;
  quantityPosition: number | null;
  selectionMode: ResourceRequirement['selectionMode'];
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

export async function resolveFlatLineCandidates(
  service: Service,
  ctx: ResolutionContext,
  lineStart: Date,
  lineEnd: Date,
  isLastLine: boolean,
  selectionsByKey: Map<string, string[]>,
): Promise<ResourceOccupancyCandidate[]> {
  const requirements =
    service.resourceRequirements.length > 0
      ? service.resourceRequirements
      : [DEGENERATE_LOCATION_REQUIREMENT];
  const candidates: ResourceOccupancyCandidate[] = [];
  for (const requirement of requirements) {
    const chosenResourceIds =
      selectionsByKey.get(selectionKey(service.id, null, requirement.type)) ?? [];
    const resources = await resolveRequirementResources(
      requirement,
      ctx,
      chosenResourceIds,
      lineStart,
    );
    candidates.push(
      ...buildFlatCandidatesForRequirement(
        resources,
        requirement,
        service,
        lineStart,
        lineEnd,
        isLastLine,
        ctx.availabilityService,
      ),
    );
  }
  return candidates;
}

function buildFlatCandidatesForRequirement(
  resources: Resource[],
  requirement: ResourceRequirement,
  service: Service,
  lineStart: Date,
  lineEnd: Date,
  isLastLine: boolean,
  availabilityService: AvailabilityService,
): ResourceOccupancyCandidate[] {
  return resources.map((resource, index) => {
    const gap = isLastLine
      ? availabilityService.effectiveFlatGapMinutes(
          service.bufferAfterMinutes ?? 0,
          resource.turnoverMinutes,
        )
      : 0;
    return {
      resourceId: resource.id,
      resourceType: resource.type,
      resourceName: resource.name,
      legIndex: null,
      quantityPosition: resources.length > 1 ? index : null,
      startsAt: lineStart,
      endsAt: new Date(lineEnd.getTime() + gap * 60_000),
      selectionMode: requirement.selectionMode,
    };
  });
}

// computeLegSpans's turnover param only extends a leg's OWN endsAtWithTurnover — it never affects
// the next leg's startsAt (that's transitionGapAfterMinutes alone, a static per-leg service
// value). So turnover is entirely per-resource and per-leg-sequencing-independent: spans are
// computed once with zero turnover, then each candidate adds its OWN resource's turnoverMinutes
// to that raw leg end — never a pool-wide max applied uniformly to every candidate regardless of
// which one actually ends up free.
const NO_TURNOVER = new Map<number, number>();

export async function resolveLeggedLineCandidates(
  service: Service,
  ctx: ResolutionContext,
  lineStart: Date,
  selectionsByKey: Map<string, string[]>,
): Promise<ResourceOccupancyCandidate[]> {
  const legs = service.legs!;
  const perLeg = await resolvePerLegResources(legs, ctx, selectionsByKey, service.id, lineStart);
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

  return perLeg.map(({ legIndex, resource, quantityPosition, selectionMode }) => {
    const span = spanByLegIndex.get(legIndex)!;
    return {
      resourceId: resource.id,
      resourceType: resource.type,
      resourceName: resource.name,
      legIndex,
      quantityPosition,
      startsAt: span.startsAt,
      endsAt: new Date(span.endsAtWithTurnover.getTime() + resource.turnoverMinutes * 60_000),
      selectionMode,
    };
  });
}

async function resolvePerLegResources(
  legs: ServiceLeg[],
  ctx: ResolutionContext,
  selectionsByKey: Map<string, string[]>,
  serviceId: string,
  windowStart: Date,
): Promise<PerLegResource[]> {
  const perLeg: PerLegResource[] = [];
  for (const leg of legs) {
    for (const requirement of leg.resourceRequirements) {
      const chosenResourceIds =
        selectionsByKey.get(selectionKey(serviceId, leg.legIndex, requirement.type)) ?? [];
      const resources = await resolveRequirementResources(
        requirement,
        ctx,
        chosenResourceIds,
        windowStart,
      );
      resources.forEach((resource, index) => {
        perLeg.push({
          legIndex: leg.legIndex,
          resource,
          quantityPosition: resources.length > 1 ? index : null,
          selectionMode: requirement.selectionMode,
        });
      });
    }
  }
  return perLeg;
}
