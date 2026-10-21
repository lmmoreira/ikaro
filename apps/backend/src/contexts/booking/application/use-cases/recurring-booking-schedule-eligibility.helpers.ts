import { RecurringBookingScheduleIneligibleServiceError } from '../../domain/errors/recurring-booking-schedule.error';
import { RequestRecurringBookingScheduleResourceAssignmentInput } from '../../domain/recurring-booking-schedule.aggregate';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { Service } from '../../domain/service.aggregate';
import { CustomerChoicePick, effectiveRequirements } from './recurring-service-requirement.helpers';

// Eligibility, as of TD49 Story 0: an APPOINTMENT service with recurrence on, no pickup address and
// no legs, whose every requirement has a quantity of one and can be resolved per occurrence
// (CUSTOMER_CHOICE, AUTO_ANY, AUTO_FUNGIBLE_POOL, or NONE on the unrestricted LOCATION — the
// default shape of TD49-S03, which also covers a service with no requirement at all). Legged
// (sequential itinerary) recurrence stays out of scope.
export function assertServiceEligible(service: Service): void {
  if (service.bookingModel !== 'APPOINTMENT') {
    throw new RecurringBookingScheduleIneligibleServiceError('not-appointment');
  }
  if (!service.bookingPolicy.recurrenceEligible) {
    throw new RecurringBookingScheduleIneligibleServiceError('recurrence-not-enabled');
  }
  // A recurring request carries no pickup address to snapshot onto the occurrences, so a service
  // that needs one can never be materialized.
  if (service.requiresPickupAddress) {
    throw new RecurringBookingScheduleIneligibleServiceError('requires-pickup-address');
  }
  if (service.legs !== null) {
    throw new RecurringBookingScheduleIneligibleServiceError('legged-or-bundled');
  }
  for (const requirement of effectiveRequirements(service)) {
    if (requirement.requiredQuantity !== 1) {
      throw new RecurringBookingScheduleIneligibleServiceError('legged-or-bundled');
    }
    if (!isResolvablePerOccurrence(requirement)) {
      throw new RecurringBookingScheduleIneligibleServiceError('selection-mode-mismatch');
    }
  }
}

// NONE keeps a one-off booking's "first eligible pick", which is only well defined for the tenant's
// single, unrestricted LOCATION.
function isResolvablePerOccurrence(requirement: ResourceRequirement): boolean {
  if (requirement.selectionMode !== 'NONE') return true;
  return (
    requirement.type === 'LOCATION' &&
    (requirement.resourcePoolIds === null || requirement.resourcePoolIds.length === 0)
  );
}

// A schedule stores a resource only for a CUSTOMER_CHOICE requirement (its automatic requirements
// are resolved per occurrence). `requirement_id` stays null: a service save replaces its
// requirement rows, so the column could not reference one (docs/DATABASE_SCHEMA.md); the
// requirement is identified by `resource_type`.
export function buildResourceAssignments(
  picks: CustomerChoicePick[],
): RequestRecurringBookingScheduleResourceAssignmentInput[] {
  return picks.map(({ requirement, resourceId }) => ({
    resourceId,
    resourceType: requirement.type,
    requirementId: null,
    requiredQuantityPosition: null,
  }));
}
