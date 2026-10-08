import { ResourceRequirement } from '../../domain/resource-requirement';
import { Service } from '../../domain/service.aggregate';
import type {
  BookingLineForResolution,
  ResourceSelectionInput,
} from './resource-occupancy.helpers';
import { DEGENERATE_LOCATION_REQUIREMENT } from './resource-occupancy-candidate-builders.helpers';
import { resolveEligibleResources } from './resource-requirement-resolution.helpers';
import { ResolutionContext } from './resource-resolution-context.helpers';

// An automatic requirement (AUTO_ANY, AUTO_FUNGIBLE_POOL, NONE) picks its resource from the
// occupancy it reads, so the read has to happen while holding the lock on every resource it might
// pick — otherwise two concurrent requests both read the same units as free, both choose the
// first, and the loser is rejected although another unit was free (a lock only orders callers who
// both acquire it, docs/ENGINEERING_RULES_BACKEND.md § A lock only orders callers).
//
// Everything the booking can touch is locked in ONE lockResources() call, which sorts the ids:
// the automatic requirements' eligible units plus every customer-chosen unit. Taking them in
// several calls would let two bookings that mix an automatic and a chosen resource each hold one
// lock and wait for the other's. assertSlotFree() later locks the chosen subset again, which this
// transaction already holds.
export async function lockCandidateResources(params: {
  lines: BookingLineForResolution[];
  serviceMap: Map<string, Service>;
  resourceSelections: ResourceSelectionInput[];
  ctx: ResolutionContext;
  lockResources: (resourceIds: string[]) => Promise<void>;
}): Promise<void> {
  const { lines, serviceMap, resourceSelections, ctx } = params;
  const automatic = lines
    .flatMap((line) => requirementsOf(serviceMap.get(line.serviceId)))
    .filter((requirement) => requirement.selectionMode !== 'CUSTOMER_CHOICE');
  if (automatic.length === 0) return;

  const resourceIds = new Set(resourceSelections.map((selection) => selection.resourceId));
  const eligible = await Promise.all(
    distinctRequirements(automatic).map((requirement) =>
      resolveEligibleResources(requirement, ctx),
    ),
  );
  for (const resource of eligible.flat()) resourceIds.add(resource.id);
  await params.lockResources([...resourceIds]);
}

// Two lines of the same service (or two services with the same pool) would resolve the same
// eligible set twice; resolving them concurrently would also miss ctx's per-type cache and query
// the same type twice.
function distinctRequirements(requirements: ResourceRequirement[]): ResourceRequirement[] {
  const byKey = new Map<string, ResourceRequirement>();
  for (const requirement of requirements) {
    const pool = [...(requirement.resourcePoolIds ?? [])]
      .sort((a, b) => a.localeCompare(b))
      .join(',');
    byKey.set(`${requirement.type}|${pool}`, requirement);
  }
  return [...byKey.values()];
}

// An unknown service is left for the resolution loop to report (BookingServiceNotInTenantError); a
// service with nothing configured resolves against the tenant's LOCATION, so that is locked too.
function requirementsOf(service: Service | undefined): ResourceRequirement[] {
  if (!service) return [];
  if (service.legs) return service.legs.flatMap((leg) => leg.resourceRequirements);
  return service.resourceRequirements.length > 0
    ? service.resourceRequirements
    : [DEGENERATE_LOCATION_REQUIREMENT];
}
