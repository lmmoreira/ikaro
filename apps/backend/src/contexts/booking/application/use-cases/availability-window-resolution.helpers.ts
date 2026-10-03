import type { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import { AvailabilityService } from '../../domain/services/availability.service';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceOccupiedSlot } from '../../domain/resource-occupied-slot';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { ScheduleClosure } from '../../domain/schedule-closure.aggregate';
import { ScheduleOpening } from '../../domain/schedule-opening.aggregate';
import { ServiceLeg } from '../../domain/service-leg';
import { IResourceRepository } from '../ports/resource-repository.port';
import { AvailabilityLine } from './availability-lines.helpers';
import {
  createWindowResolutionContext,
  resolveActiveCandidates,
  WindowResolutionContext,
} from './availability-window-candidates.helpers';
import { selectionKey } from './resource-resolution-context.helpers';

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

const DEGENERATE_LOCATION_REQUIREMENT = ResourceRequirement.create({
  type: ResourceType.LOCATION,
  selectionMode: 'NONE',
});

interface LineSpan {
  line: AvailabilityLine;
  lineStart: Date;
  lineEnd: Date;
  isLastLine: boolean;
}

// The sequential cursor (each line starts where the previous one ends) is pure date arithmetic, so
// every line's own window can be computed up front and its resource lookups run concurrently.
function computeLineSpans(candidateStart: Date, lines: AvailabilityLine[]): LineSpan[] {
  let cursor = candidateStart;
  return lines.map((line, index) => {
    const lineStart = cursor;
    const lineEnd = new Date(cursor.getTime() + line.durationMinutes * 60_000);
    cursor = lineEnd;
    return { line, lineStart, lineEnd, isLastLine: index === lines.length - 1 };
  });
}

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
  lines: AvailabilityLine[],
  ctx: WindowResolutionContext = createWindowResolutionContext(
    resourceRepo,
    availabilityService,
    tenantId,
  ),
): Promise<RequirementWindowEntry[]> {
  const perLine = await Promise.all(
    computeLineSpans(candidateStart, lines).map(({ line, lineStart, lineEnd, isLastLine }) =>
      line.service.legs
        ? resolveLeggedWindows(line, ctx, lineStart)
        : resolveFlatWindows(line, ctx, lineStart, lineEnd, isLastLine),
    ),
  );
  return perLine.flat();
}

async function resolveFlatWindows(
  line: AvailabilityLine,
  ctx: WindowResolutionContext,
  lineStart: Date,
  lineEnd: Date,
  isLastLine: boolean,
): Promise<RequirementWindowEntry[]> {
  const { service } = line;
  const requirements =
    service.resourceRequirements.length > 0
      ? service.resourceRequirements
      : [DEGENERATE_LOCATION_REQUIREMENT];
  return Promise.all(
    requirements.map(async (requirement) => {
      const resources = await resolveActiveCandidates(
        requirement,
        ctx,
        line.pins.get(selectionKey(service.id, null, requirement.type)),
      );
      return resources.map((resource) => {
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
      });
    }),
  );
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

function resolvePerLegCandidates(
  line: AvailabilityLine,
  legs: ServiceLeg[],
  ctx: WindowResolutionContext,
): Promise<PerLegCandidates[]> {
  return Promise.all(
    legs.flatMap((leg) =>
      leg.resourceRequirements.map(async (requirement) => ({
        legIndex: leg.legIndex,
        resources: await resolveActiveCandidates(
          requirement,
          ctx,
          line.pins.get(selectionKey(line.service.id, leg.legIndex, requirement.type)),
        ),
        requiredQuantity: requirement.requiredQuantity,
      })),
    ),
  );
}

async function resolveLeggedWindows(
  line: AvailabilityLine,
  ctx: WindowResolutionContext,
  lineStart: Date,
): Promise<RequirementWindowEntry[]> {
  const legs = line.service.legs!;
  const perLeg = await resolvePerLegCandidates(line, legs, ctx);

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

export interface ResourceAvailabilityContext {
  resource: Resource | null;
  closures: ScheduleClosure[];
  tenantOpening: ScheduleOpening | null;
  resourceOpening: ScheduleOpening | null;
  occupancy: ResourceOccupiedSlot[];
}

export interface ResourceScopedAvailabilityDeps {
  availabilityService: AvailabilityService;
  windowContext: WindowResolutionContext;
  date: string;
  businessHours: BusinessHours;
  loadResourceContext: (resourceId: string) => Promise<ResourceAvailabilityContext>;
}

// One candidate start time's full UC-058 intersect(union(...)) check across every line/leg's
// requirement windows. `contextCache` is owned by the caller and shared across every candidate
// start time in a day's search — each resource's own schedule/occupancy is constant for the
// whole day, so caching bounds I/O by unique resourceIds referenced, not by
// (candidateStarts × entries × candidates). It holds promises so slots evaluated concurrently
// share one in-flight load.
export async function isBookingWindowAvailable(
  deps: ResourceScopedAvailabilityDeps,
  lines: AvailabilityLine[],
  candidateStart: Date,
  contextCache: Map<string, Promise<ResourceAvailabilityContext>>,
): Promise<boolean> {
  const entries = await resolveAvailabilityRequirementWindows(
    deps.windowContext.resourceRepo,
    deps.availabilityService,
    deps.windowContext.tenantId,
    candidateStart,
    lines,
    deps.windowContext,
  );
  const satisfied = await Promise.all(
    entries.map((entry) => enoughCandidatesFree(deps, entry, contextCache)),
  );
  return satisfied.every(Boolean);
}

function loadCachedResourceContext(
  deps: ResourceScopedAvailabilityDeps,
  cache: Map<string, Promise<ResourceAvailabilityContext>>,
  resourceId: string,
): Promise<ResourceAvailabilityContext> {
  let pending = cache.get(resourceId);
  if (!pending) {
    pending = deps.loadResourceContext(resourceId);
    cache.set(resourceId, pending);
  }
  return pending;
}

// A fungible requirement's requiredQuantity > 1 needs that many DISTINCT candidates
// simultaneously free, not just one — the write path resolves exactly requiredQuantity resources
// per requirement (resource-occupancy.helpers.ts's resolveRequirementResources), so a read-path
// "available" verdict backed by only one free member would let a customer pick a slot the write
// path then can't actually fulfil.
async function enoughCandidatesFree(
  deps: ResourceScopedAvailabilityDeps,
  candidates: RequirementWindowEntry,
  cache: Map<string, Promise<ResourceAvailabilityContext>>,
): Promise<boolean> {
  if (candidates.length === 0) return false;
  const contexts = await Promise.all(
    candidates.map((candidate) => loadCachedResourceContext(deps, cache, candidate.resourceId)),
  );
  const freeCount = candidates.filter((candidate, index) => {
    const ctx = contexts[index];
    return deps.availabilityService.isWindowFree(
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
  }).length;
  return freeCount >= candidates[0].requiredQuantity;
}
