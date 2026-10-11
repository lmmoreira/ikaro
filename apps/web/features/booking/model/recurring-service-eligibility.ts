import type { HotsiteServiceResponse } from '@ikaro/types';
import { recurrenceShapeBlockers, type RecurrenceBlocker } from './recurrence-shape';

// Which services the customer's "new recurring reservation" form offers (M23-S17, TD49-S03). No
// React, no shell or my-account imports: the staff-side creation (M23-S19) reuses it.

/**
 * Mirrors the backend's `assertServiceEligible()` (TD49-S03): a recurrence-enabled appointment
 * service with no legs and no pickup address whose resources are the default shape (none, or the
 * unrestricted tenant location) or exactly one requirement of quantity 1 with a choosable or
 * automatic mode — plus, web only, a fixed duration (the form shows it read-only). The backend
 * stays the authority — a service this lets through but the backend refuses ends in the generic
 * failure.
 */
export function isRecurrenceEligibleService(service: HotsiteServiceResponse): boolean {
  return service.bookingPolicy.recurrenceEligible && recurrenceBlockersOf(service).length === 0;
}

/** Why a service's shape cannot recur, whatever its recurrence toggle says. */
export function recurrenceBlockersOf(service: HotsiteServiceResponse): RecurrenceBlocker[] {
  return recurrenceShapeBlockers({
    bookingModel: service.bookingModel,
    hasLegs: service.legs !== null,
    requiresPickupAddress: service.requiresPickupAddress,
    durationPolicy: service.bookingPolicy.durationPolicy,
    resourceRequirements: service.resourceRequirements,
  });
}

/**
 * Which empty state the form shows when no service is offered: no service has recurrence enabled,
 * or some do but none meets the rule. The customer never sees a technical reason.
 */
export type NoRecurrenceServicesReason = 'NONE_ENABLED' | 'NONE_QUALIFY';

export function noRecurrenceServicesReason(
  services: readonly HotsiteServiceResponse[],
): NoRecurrenceServicesReason {
  return services.some((service) => service.bookingPolicy.recurrenceEligible)
    ? 'NONE_QUALIFY'
    : 'NONE_ENABLED';
}

export function filterRecurrenceEligibleServices(
  services: readonly HotsiteServiceResponse[],
): HotsiteServiceResponse[] {
  return services.filter(isRecurrenceEligibleService);
}
