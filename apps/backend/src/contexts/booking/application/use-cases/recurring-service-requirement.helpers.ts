import { BookingResourceSelectionRequiredError } from '../../domain/errors/booking-domain.error';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { Service } from '../../domain/service.aggregate';
import { DEGENERATE_LOCATION_REQUIREMENT } from './resource-occupancy-candidate-builders.helpers';

export type RecurringAssignmentPolicy = 'FIXED_ASSIGNMENT' | 'RESOLVE_PER_OCCURRENCE';

// One resourceSelections entry of a recurring request: the resource a customer picked for the
// requirement of that type (TD49 Story 0).
export interface RecurringResourceSelection {
  // The wire value (the request schema's string union); a ResourceType member is assignable to it.
  resourceType: `${ResourceType}`;
  resourceId: string;
}

export interface CustomerChoicePick {
  requirement: ResourceRequirement;
  resourceId: string;
}

// The requirements a recurring schedule is checked and held against, in the service's own order
// (TD49-S03, S00). A service with nothing configured falls back to the tenant's LOCATION exactly as
// a one-off booking does (resource-occupancy-candidate-builders.helpers.ts), so a recurring
// schedule for it holds that same resource. Callers run after assertServiceEligible().
export function effectiveRequirements(service: Service): ResourceRequirement[] {
  return service.resourceRequirements.length > 0
    ? [...service.resourceRequirements]
    : [DEGENERATE_LOCATION_REQUIREMENT];
}

// The policy follows the service, never the request (TD49 Story 0): a schedule stores a resource
// only for a CUSTOMER_CHOICE requirement, so any such requirement makes it FIXED_ASSIGNMENT (a
// mixed bundle included — its automatic requirements are resolved per occurrence); a service with
// none resolves everything per occurrence.
export function deriveAssignmentPolicy(service: Service): RecurringAssignmentPolicy {
  return effectiveRequirements(service).some(
    (requirement) => requirement.selectionMode === 'CUSTOMER_CHOICE',
  )
    ? 'FIXED_ASSIGNMENT'
    : 'RESOLVE_PER_OCCURRENCE';
}

// The resource picked for each CUSTOMER_CHOICE requirement, in requirement order. Selections are
// keyed by resource type and consumed in order, like a one-off booking's (consumeSelections); an
// entry for any other requirement is ignored, and the same resource can never satisfy two
// requirements (it would be held twice).
export function pickCustomerChoices(
  requirements: ResourceRequirement[],
  selections: RecurringResourceSelection[],
): CustomerChoicePick[] {
  const queues = new Map<`${ResourceType}`, string[]>();
  for (const { resourceType, resourceId } of selections) {
    queues.set(resourceType, [...(queues.get(resourceType) ?? []), resourceId]);
  }
  const taken = new Set<string>();
  return requirements
    .filter((requirement) => requirement.selectionMode === 'CUSTOMER_CHOICE')
    .map((requirement) => {
      const resourceId = queues.get(requirement.type)?.shift();
      if (resourceId === undefined || taken.has(resourceId)) {
        throw new BookingResourceSelectionRequiredError(requirement.type);
      }
      taken.add(resourceId);
      return { requirement, resourceId };
    });
}
