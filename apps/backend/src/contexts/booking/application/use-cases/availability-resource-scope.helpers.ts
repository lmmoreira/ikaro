import { Service } from '../../domain/service.aggregate';

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
