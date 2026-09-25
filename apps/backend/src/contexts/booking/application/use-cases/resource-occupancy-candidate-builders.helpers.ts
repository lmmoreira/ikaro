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
  // True bundle per the story's own definition (resourceRequirements.length >= 2, UC-064) — never
  // the degenerate-fallback single-entry array, and never conflated with a requirement's own
  // requiredQuantity (a fungible-pool multi-unit requirement is not a bundle). Drives
  // BookingSlotConflictService's error classification.
  const isBundle = requirements.length > 1;
  // Single source of truth for "this resource's own trailing buffer/turnover gap" — shared by
  // resolveRequirementResources' AUTO_ANY availability pre-filter (which must check each
  // candidate's TRUE effective window, not just the raw one) and the final candidate build below,
  // so the two never compute a different answer for the same resource.
  const gapMinutesFor = (resource: Resource): number =>
    isLastLine
      ? ctx.availabilityService.effectiveFlatGapMinutes(
          service.bufferAfterMinutes ?? 0,
          resource.turnoverMinutes,
        )
      : 0;
  const candidates: ResourceOccupancyCandidate[] = [];
  for (const requirement of requirements) {
    candidates.push(
      ...(await resolveFlatCandidatesForRequirement(requirement, service.id, ctx, {
        lineStart,
        lineEnd,
        isBundleMember: isBundle,
        gapMinutesFor,
        selectionsByKey,
      })),
    );
  }
  return candidates;
}

interface FlatRequirementResolutionContext extends FlatCandidateBuildContext {
  selectionsByKey: Map<string, string[]>;
}

// windowEnd passed to resolveRequirementResources is the RAW (pre-gap) line end — the final
// per-resource gap-adjusted endsAt is computed by buildFlatCandidatesForRequirement below, and
// resolveRequirementResources applies that same gapMinutesFor function to each AUTO_ANY
// candidate's own availability pre-check too.
async function resolveFlatCandidatesForRequirement(
  requirement: ResourceRequirement,
  serviceId: string,
  ctx: ResolutionContext,
  resolutionCtx: FlatRequirementResolutionContext,
): Promise<ResourceOccupancyCandidate[]> {
  const { lineStart, lineEnd, isBundleMember, gapMinutesFor, selectionsByKey } = resolutionCtx;
  const chosenResourceIds =
    selectionsByKey.get(selectionKey(serviceId, null, requirement.type)) ?? [];
  const resources = await resolveRequirementResources(
    requirement,
    ctx,
    chosenResourceIds,
    lineStart,
    lineEnd,
    gapMinutesFor,
  );
  return buildFlatCandidatesForRequirement(resources, requirement, {
    lineStart,
    lineEnd,
    isBundleMember,
    gapMinutesFor,
  });
}

interface FlatCandidateBuildContext {
  lineStart: Date;
  lineEnd: Date;
  isBundleMember: boolean;
  gapMinutesFor: (resource: Resource) => number;
}

function buildFlatCandidatesForRequirement(
  resources: Resource[],
  requirement: ResourceRequirement,
  buildCtx: FlatCandidateBuildContext,
): ResourceOccupancyCandidate[] {
  const { lineStart, lineEnd, isBundleMember, gapMinutesFor } = buildCtx;
  return resources.map((resource, index) => ({
    resourceId: resource.id,
    resourceType: resource.type,
    resourceName: resource.name,
    legIndex: null,
    quantityPosition: resources.length > 1 ? index : null,
    startsAt: lineStart,
    endsAt: new Date(lineEnd.getTime() + gapMinutesFor(resource) * 60_000),
    selectionMode: requirement.selectionMode,
    isBundleMember,
  }));
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
      // A legged candidate is classified via its own non-null legIndex, never isBundleMember —
      // see BookingSlotConflictService's classifier.
      isBundleMember: false,
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
      // windowEnd is null (not the raw leg span) on purpose — a leg's exact sub-window isn't
      // known until computeLegSpans runs, which itself needs resources chosen first. Legs also
      // don't want the availability pre-filter at all: UC-065 A1's atomic all-or-nothing design
      // means a leg conflict should fail the whole chain via assertSlotFree(), not silently retry
      // a different resource for this one leg.
      const resources = await resolveRequirementResources(
        requirement,
        ctx,
        chosenResourceIds,
        windowStart,
        null,
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
