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

// windowEnd is the requirement's own exact window end when known upfront (a flat line's raw,
// pre-gap lineEnd), or null when it isn't (a legged requirement — see
// resource-occupancy-candidate-builders.helpers.ts's call site for why legs deliberately opt out
// of the AUTO_ANY availability pre-filter below).
export async function resolveRequirementResources(
  requirement: ResourceRequirement,
  ctx: ResolutionContext,
  chosenResourceIds: string[],
  windowStart: Date,
  windowEnd: Date | null,
): Promise<Resource[]> {
  const candidateIds = await resolveCandidateIds(
    requirement,
    ctx,
    chosenResourceIds,
    windowStart,
    windowEnd,
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
): Promise<string[]> {
  if (requirement.selectionMode === 'CUSTOMER_CHOICE') {
    return resolveCustomerChoiceCandidateIds(requirement, chosenResourceIds);
  }
  const eligible = await resolveEligibleCandidateIds(requirement, ctx);
  if (requirement.selectionMode === 'AUTO_ANY') {
    const free = await preferFreeCandidateIds(eligible, ctx, windowStart, windowEnd);
    return sortByLeastWorkload(free, ctx, windowStart);
  }
  return eligible;
}

// Narrows to the subset of candidateIds with no conflicting HOLD/COMMITTED row for the exact
// requested window, before the workload sort ever runs — otherwise a lower-workload-but-busy
// candidate could be preferred over a higher-workload-but-free one, and the booking would fail
// with a 409 even though a genuinely free resource existed (UC-063's main flow: "assigns
// whichever eligible staff member is free"). windowEnd === null (legs) or a single candidate
// skips the filter entirely — see resolveRequirementResources' own doc comment for why.
// Falls back to the full candidateIds list when every one of them appears busy, so the caller's
// requiredQuantity/assertSlotFree checks still run and produce the correct "unavailable" error,
// rather than this function returning [] and misreporting via a wrong error path.
async function preferFreeCandidateIds(
  candidateIds: string[],
  ctx: ResolutionContext,
  windowStart: Date,
  windowEnd: Date | null,
): Promise<string[]> {
  if (windowEnd === null || candidateIds.length <= 1) return candidateIds;
  const windows = candidateIds.map((resourceId) => ({
    resourceId,
    startsAt: windowStart,
    endsAt: windowEnd,
  }));
  const conflicting = new Set(
    await ctx.occupancyRepo.findConflictingResourceIds(
      ctx.tenantId,
      windows,
      ctx.excludeBookingLineIds,
    ),
  );
  const free = candidateIds.filter((id) => !conflicting.has(id));
  return free.length > 0 ? free : candidateIds;
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

async function resolveEligibleCandidateIds(
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

// UC-063 A1 — "least already-locked workload on the tenant-local day, resourceId as stable
// tie-breaker." Uses the line's own lineStart (not a per-leg sub-window, which isn't known yet at
// resolution time — computeLegSpans runs after resources are chosen) as "the day"; a booking
// spanning local midnight is an edge case this approximation doesn't need to solve precisely.
async function sortByLeastWorkload(
  resourceIds: string[],
  ctx: ResolutionContext,
  windowStart: Date,
): Promise<string[]> {
  if (resourceIds.length <= 1) return resourceIds;
  const { start, end } = localDayBoundsUTC(windowStart, ctx.timezone);
  const workload = await ctx.occupancyRepo.countActiveByResource(
    ctx.tenantId,
    resourceIds,
    start,
    end,
    ctx.excludeBookingLineIds,
  );
  return [...resourceIds].sort((a, b) => {
    const diff = (workload.get(a) ?? 0) - (workload.get(b) ?? 0);
    return diff !== 0 ? diff : a.localeCompare(b);
  });
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
  // since every candidate id it ever saw was already sourced from resolveEligibleCandidateIds's
  // own pool-correct output.
  const found = await fetchResourceCached(id, ctx);
  const poolRestricted = !!requirement.resourcePoolIds && !requirement.resourcePoolIds.includes(id);
  if (!found?.isActive || found.type !== requirement.type || poolRestricted) {
    throw new BookingServiceResourceTypeUnavailableError(requirement.type);
  }
  return found;
}
