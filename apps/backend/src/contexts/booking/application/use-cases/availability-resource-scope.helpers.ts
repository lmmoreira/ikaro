import { Service } from '../../domain/service.aggregate';
import { IResourceRepository } from '../ports/resource-repository.port';

export interface AvailabilityRequirementEntry {
  // Every candidate resource id that could fill this one requirement (a pool has several; NONE/
  // AUTO_ANY with no resourcePoolIds restriction resolves to every active resource of the type).
  candidateResourceIds: string[];
}

// A service is "degenerate" (today's exact car-wash-style tenant-wide model) when it has no legs
// and either no resourceRequirements at all (a service that predates M22-S01's backfill — nothing
// to scope by, so it falls back to tenant-wide) or exactly one flat requirement targeting LOCATION
// with no pool restriction (the shape M22-S01's backfill produces for every pre-existing service
// going forward). Anything else is resource-scoped: a bundle (>1 requirement), a fungible pool
// (>1 candidate for one requirement), or legs.
export function isDegenerateService(service: Service): boolean {
  if (service.legs) return false;
  const requirements = service.resourceRequirements;
  if (requirements.length === 0) return true;
  if (requirements.length !== 1) return false;
  const [only] = requirements;
  return (
    only.type === 'LOCATION' && (only.resourcePoolIds === null || only.resourcePoolIds.length === 0)
  );
}

// Flattens a resource-scoped service's requirements into one uniform list of "entries," whether
// they come from flat resourceRequirements or from every leg's own resourceRequirements. Read-path
// availability treats a legged service's per-leg resources as one more bundle dimension — every
// entry must have a free candidate for the WHOLE query window, same as a flat bundle's own
// members — which is a deliberately conservative simplification (it never reports a slot as
// available when a leg's true, narrower sub-window would actually be free-but-blocked outside it;
// it can only under-report availability, never double-book). True per-leg sub-window availability
// is real M23 booking-flow scope once legged services are actually bookable end-to-end.
export async function resolveAvailabilityRequirementEntries(
  service: Service,
  resourceRepo: IResourceRepository,
  tenantId: string,
): Promise<AvailabilityRequirementEntry[]> {
  const requirements = service.legs
    ? service.legs.flatMap((leg) => leg.resourceRequirements)
    : service.resourceRequirements;

  const entries: AvailabilityRequirementEntry[] = [];
  for (const requirement of requirements) {
    if (requirement.resourcePoolIds && requirement.resourcePoolIds.length > 0) {
      entries.push({ candidateResourceIds: requirement.resourcePoolIds });
      continue;
    }
    const active = await resourceRepo.findByTenant(tenantId, {
      type: requirement.type,
      isActive: true,
    });
    entries.push({ candidateResourceIds: active.map((r) => r.id) });
  }
  return entries;
}
