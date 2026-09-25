import { localDayBoundsUTC } from '../../../../shared/utils/calendar-date';
import {
  BookingResourceSelectionRequiredError,
  BookingServiceResourceTypeUnavailableError,
} from '../../domain/errors/booking-domain.error';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResolutionContext } from './resource-resolution-context.helpers';

// Split out of resource-occupancy.helpers.ts (docs/CODE_STANDARDS.md's file-length limit) — the
// selectionMode-aware algorithm for turning one ResourceRequirement + its caller-supplied
// resourceSelections entry (if any) into concrete Resource(s), shared by both the flat and legged
// candidate builders in resource-occupancy-candidate-builders.helpers.ts.

// windowEnd is the requirement's own raw (pre-resource-turnover) window end — a flat line's
// lineEnd, or a legged requirement's own leg span end from computeLegSpans (known upfront from the
// service's static leg definitions alone, independent of which resource ultimately gets chosen —
// see resource-occupancy-candidate-builders.helpers.ts's resolveLeggedLineCandidates). Only null
// for callers with no meaningful window at all. effectiveGapMinutes computes each CANDIDATE's own
// trailing buffer/turnover gap given its resolved Resource — the same math
// buildFlatCandidatesForRequirement/resolveLeggedLineCandidates use to build the final persisted
// endsAt, needed here too so the pre-filter checks each candidate against its own true effective
// window, not just the raw one (a resource busy only during its own trailing gap must still be
// excluded — UC-063's "assigns whichever eligible staff member is free" means truly free, not
// free-until-the-buffer-starts).
export async function resolveRequirementResources(
  requirement: ResourceRequirement,
  ctx: ResolutionContext,
  chosenResourceIds: string[],
  windowStart: Date,
  windowEnd: Date | null,
  effectiveGapMinutes: (resource: Resource) => number = () => 0,
): Promise<Resource[]> {
  const candidateIds = await resolveCandidateIds(
    requirement,
    ctx,
    chosenResourceIds,
    windowStart,
    windowEnd,
    effectiveGapMinutes,
  );
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

// selectionMode-aware since M23-S01 (UC-061/062/063): CUSTOMER_CHOICE uses the caller-supplied
// resourceSelections entry; AUTO_ANY narrows to candidates actually free for the exact requested
// window (when known) before sorting by least already-locked workload on the tenant-local day,
// resourceId as stable secondary sort (UC-063 A1 — the tie-break only applies "among candidates
// already free for the chosen slot," not as a substitute for checking availability at all);
// AUTO_FUNGIBLE_POOL/NONE keep the original deterministic first-eligible pick (no identity
// reveal, no tie-break rule specified for a pool).
async function resolveCandidateIds(
  requirement: ResourceRequirement,
  ctx: ResolutionContext,
  chosenResourceIds: string[],
  windowStart: Date,
  windowEnd: Date | null,
  effectiveGapMinutes: (resource: Resource) => number,
): Promise<string[]> {
  if (requirement.selectionMode === 'CUSTOMER_CHOICE') {
    return resolveCustomerChoiceCandidateIds(requirement, chosenResourceIds);
  }
  const eligible = await resolveEligibleResources(requirement, ctx);
  if (requirement.selectionMode === 'AUTO_ANY') {
    const free = await preferFreeResources(
      eligible,
      ctx,
      windowStart,
      windowEnd,
      effectiveGapMinutes,
    );
    return sortResourcesByLeastWorkload(free, ctx, windowStart);
  }
  return eligible.map((resource) => resource.id);
}

// Narrows to the subset of resources with no conflicting HOLD/COMMITTED row for each candidate's
// own true effective window (raw window + that resource's own trailing buffer/turnover gap, via
// effectiveGapMinutes), before the workload sort ever runs — otherwise a lower-workload-but-busy
// candidate could be preferred over a higher-workload-but-free one, and the booking would fail
// with a 409 even though a genuinely free resource existed (UC-063's main flow: "assigns whichever
// eligible staff member is free"; UC-065's chained itinerary needs the identical treatment per
// leg). windowEnd === null or a single candidate skips the filter entirely — see
// resolveRequirementResources' own doc comment for why null still occurs for some callers. Falls
// back to the full resource list when every one of them appears busy, so the caller's
// requiredQuantity/assertSlotFree checks still run and produce the correct "unavailable" error,
// rather than this function returning [] and misreporting via a wrong error path. Takes already-
// resolved Resource objects (from resolveEligibleResources) rather than bare ids — no per-candidate
// findById() here.
async function preferFreeResources(
  resources: Resource[],
  ctx: ResolutionContext,
  windowStart: Date,
  windowEnd: Date | null,
  effectiveGapMinutes: (resource: Resource) => number,
): Promise<Resource[]> {
  if (windowEnd === null || resources.length <= 1) return resources;
  const windows = resources.map((resource) => ({
    resourceId: resource.id,
    startsAt: windowStart,
    endsAt: new Date(windowEnd.getTime() + effectiveGapMinutes(resource) * 60_000),
  }));
  const conflicting = new Set(
    await ctx.occupancyRepo.findConflictingResourceIds(
      ctx.tenantId,
      windows,
      ctx.excludeBookingLineIds,
    ),
  );
  const free = resources.filter((resource) => !conflicting.has(resource.id));
  return free.length > 0 ? free : resources;
}

// requiredQuantity > 1 combined with CUSTOMER_CHOICE has no named UC example (the "several
// distinct units, customer picks each" shape isn't part of UC-061/064/065's main flows) — this
// still handles it correctly (one resourceSelections entry per unit, same key repeated), it's
// just untested product territory today. Deduplicated first
// — the same resourceId submitted twice must not be able to satisfy a requiredQuantity of 2; that
// would silently try to lock one physical resource as two distinct units.
function resolveCustomerChoiceCandidateIds(
  requirement: ResourceRequirement,
  chosenResourceIds: string[],
): string[] {
  const distinct = [...new Set(chosenResourceIds)];
  if (distinct.length < requirement.requiredQuantity) {
    throw new BookingResourceSelectionRequiredError(requirement.type);
  }
  return distinct;
}

// Loads the tenant's full active set of this requirement's type in ONE query, at most once per
// type per resolution call — cached on ctx.activeResourcesByType so a multi-line booking whose
// lines share a service (and therefore a requirement type) doesn't re-query per line. This also
// avoids an N-candidate findById() loop later (preferFreeResources/lookupResource reuse these same
// objects via ctx.resourceCache, populated below) and, for a resourcePoolIds-restricted
// requirement, lets the configured pool be filtered down to resources that are still active: a
// pool is a fixed, curated list of ids that can drift out of date (a member deactivated since
// configuration), and returning it unfiltered let a since-deactivated pool member reach the
// workload sort, win the tie-break over a genuinely eligible one, and then fail the whole
// requirement at the final lookupResource() check even though an active, free member existed.
async function resolveEligibleResources(
  requirement: ResourceRequirement,
  ctx: ResolutionContext,
): Promise<Resource[]> {
  const cached = ctx.activeResourcesByType.get(requirement.type);
  const activeOfType =
    cached ??
    (await ctx.resourceRepo.findByTenant(ctx.tenantId, {
      type: requirement.type,
      isActive: true,
    }));
  if (!cached) {
    ctx.activeResourcesByType.set(requirement.type, activeOfType);
    for (const resource of activeOfType) {
      ctx.resourceCache.set(resource.id, resource);
    }
  }
  if (requirement.resourcePoolIds && requirement.resourcePoolIds.length > 0) {
    const poolIds = new Set(requirement.resourcePoolIds);
    return activeOfType.filter((resource) => poolIds.has(resource.id));
  }
  if (activeOfType.length === 0) {
    throw new BookingServiceResourceTypeUnavailableError(requirement.type);
  }
  return activeOfType;
}

// UC-063 A1 — "least already-locked workload on the tenant-local day, resourceId as stable
// tie-breaker." Uses the line's own lineStart (not a per-leg sub-window, which isn't known yet at
// resolution time — computeLegSpans runs after resources are chosen) as "the day"; a booking
// spanning local midnight is an edge case this approximation doesn't need to solve precisely.
async function sortResourcesByLeastWorkload(
  resources: Resource[],
  ctx: ResolutionContext,
  windowStart: Date,
): Promise<string[]> {
  if (resources.length <= 1) return resources.map((r) => r.id);
  const { start, end } = localDayBoundsUTC(windowStart, ctx.timezone);
  const workload = await ctx.occupancyRepo.countActiveByResource(
    ctx.tenantId,
    resources.map((r) => r.id),
    start,
    end,
    ctx.excludeBookingLineIds,
  );
  return [...resources]
    .sort((a, b) => {
      const diff = (workload.get(a.id) ?? 0) - (workload.get(b.id) ?? 0);
      return diff !== 0 ? diff : a.id.localeCompare(b.id);
    })
    .map((r) => r.id);
}

async function fetchResourceCached(id: string, ctx: ResolutionContext): Promise<Resource | null> {
  const cached = ctx.resourceCache.get(id);
  if (cached) return cached;
  const found = await ctx.resourceRepo.findById(id, ctx.tenantId);
  if (found) ctx.resourceCache.set(id, found);
  return found;
}

async function lookupResource(
  id: string,
  requirement: ResourceRequirement,
  ctx: ResolutionContext,
): Promise<Resource> {
  // The resource fetch itself is cached (fetchResourceCached), but eligibility is always
  // re-validated per call — resourcePoolIds is a per-requirement restriction, not a per-resource
  // fact, so a resource cached as valid for one (unrestricted) requirement must not short-circuit
  // past a DIFFERENT requirement's pool restriction that excludes it. Matters now that
  // CUSTOMER_CHOICE can feed the same physical resource id through more than one requirement in a
  // single resolution call (M23-S01) — the pre-M23 cache-and-return-early shape didn't need this
  // since every candidate id it ever saw was already sourced from resolveEligibleResources's own
  // pool-correct output.
  const found = await fetchResourceCached(id, ctx);
  // .length > 0, not a bare truthiness check — an empty array is a real, reachable domain state
  // (ResourceRequirementSchema has no .min(1)) distinct from null, and this codebase's own
  // convention treats [] the same as null/unrestricted everywhere else (isDegenerateService,
  // resolveEligibleResources, availability-window-resolution.helpers.ts's own resourcePoolIds
  // check) — a bare `!!requirement.resourcePoolIds` would treat [] as "restricted to nothing" and
  // reject every CUSTOMER_CHOICE selection for a requirement explicitly configured as unrestricted.
  const poolRestricted =
    !!requirement.resourcePoolIds?.length && !requirement.resourcePoolIds.includes(id);
  if (!found?.isActive || found.type !== requirement.type || poolRestricted) {
    throw new BookingServiceResourceTypeUnavailableError(requirement.type);
  }
  return found;
}
