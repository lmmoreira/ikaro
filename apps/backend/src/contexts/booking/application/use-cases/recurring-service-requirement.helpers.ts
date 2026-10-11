import { ResourceRequirement } from '../../domain/resource-requirement';
import { Service } from '../../domain/service.aggregate';
import { DEGENERATE_LOCATION_REQUIREMENT } from './resource-occupancy-candidate-builders.helpers';

// The one requirement a recurring schedule is checked and held against (TD49-S03). A service with
// nothing configured falls back to the tenant's LOCATION exactly as a one-off booking does
// (resource-occupancy-candidate-builders.helpers.ts), so a recurring schedule for it holds that
// same resource. Callers run after assertServiceEligible(), which guarantees at most one.
export function effectiveRequirement(service: Service): ResourceRequirement {
  return service.resourceRequirements[0] ?? DEGENERATE_LOCATION_REQUIREMENT;
}
