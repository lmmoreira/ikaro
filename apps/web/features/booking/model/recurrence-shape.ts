import type { ResourceRequirementSelectionMode, ResourceType } from '@ikaro/types';

// The service-shape half of the recurring-reservation eligibility rule (TD49-S03), shared by the
// customer's form filter (public service shape) and the service editor's hint (staff shape). It
// mirrors the backend's `assertServiceEligible()`; the backend stays the authority. The recurrence
// toggle itself is not part of it: the editor explains why a shape cannot recur whatever the toggle.
//
// One difference from the backend is deliberate: a customer-chosen duration (`CUSTOMER_SELECTED`)
// is blocked here only, because the form shows the duration read-only.
//
// Like the backend, every requirement is checked, not only the first one: a bundle (staff + room, an
// older location + staff service) is eligible when each of its requirements has a quantity of one
// and a mode that can be resolved per occurrence (TD49 Story 2).

export type RecurrenceBlocker =
  | 'not-appointment'
  | 'legs'
  | 'quantity'
  | 'pickup-address'
  | 'selection-mode'
  | 'customer-duration';

export interface RecurrenceShape {
  readonly bookingModel: string;
  readonly hasLegs: boolean;
  readonly requiresPickupAddress: boolean;
  readonly durationPolicy: string;
  readonly resourceRequirements: readonly {
    readonly type: ResourceType;
    readonly selectionMode: ResourceRequirementSelectionMode;
    readonly requiredQuantity: number;
    // The public service shape never carries pools, so it is undefined there and read as unrestricted.
    readonly resourcePoolIds?: readonly string[] | null;
  }[];
}

const RECURRING_SELECTION_MODES: ReadonlySet<ResourceRequirementSelectionMode> = new Set([
  'CUSTOMER_CHOICE',
  'AUTO_ANY',
  'AUTO_FUNGIBLE_POOL',
]);

function isResolvablePerOccurrence(
  requirement: RecurrenceShape['resourceRequirements'][number],
): boolean {
  if (RECURRING_SELECTION_MODES.has(requirement.selectionMode)) return true;
  // NONE is only the stored form of the default shape: the unrestricted tenant LOCATION.
  return (
    requirement.selectionMode === 'NONE' &&
    requirement.type === 'LOCATION' &&
    (requirement.resourcePoolIds ?? []).length === 0
  );
}

/** Every reason this shape cannot recur, in a stable order; empty means it can. */
export function recurrenceShapeBlockers(shape: RecurrenceShape): RecurrenceBlocker[] {
  const blockers: RecurrenceBlocker[] = [];
  if (shape.bookingModel !== 'APPOINTMENT') blockers.push('not-appointment');
  if (shape.hasLegs) blockers.push('legs');
  if (shape.resourceRequirements.some((requirement) => requirement.requiredQuantity !== 1)) {
    blockers.push('quantity');
  }
  if (!shape.resourceRequirements.every(isResolvablePerOccurrence)) {
    blockers.push('selection-mode');
  }
  if (shape.requiresPickupAddress) blockers.push('pickup-address');
  if (shape.durationPolicy === 'CUSTOMER_SELECTED') blockers.push('customer-duration');
  return blockers;
}
