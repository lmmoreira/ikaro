import type { ResourceRequirementSelectionMode, ResourceType } from '@ikaro/types';

// The service-shape half of the recurring-reservation eligibility rule (TD49-S03), shared by the
// customer's form filter (public service shape) and the service editor's hint (staff shape). It
// mirrors the backend's `assertServiceEligible()`; the backend stays the authority. The recurrence
// toggle itself is not part of it: the editor explains why a shape cannot recur whatever the toggle.
//
// One difference from the backend is deliberate: a customer-chosen duration (`CUSTOMER_SELECTED`)
// is blocked here only, because the form shows the duration read-only.

export type RecurrenceBlocker =
  | 'not-appointment'
  | 'legs'
  | 'several-requirements'
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

/** Every reason this shape cannot recur, in a stable order; empty means it can. */
export function recurrenceShapeBlockers(shape: RecurrenceShape): RecurrenceBlocker[] {
  const blockers: RecurrenceBlocker[] = [];
  if (shape.bookingModel !== 'APPOINTMENT') blockers.push('not-appointment');
  if (shape.hasLegs) blockers.push('legs');
  if (shape.resourceRequirements.length > 1) blockers.push('several-requirements');
  const [requirement] = shape.resourceRequirements;
  if (requirement !== undefined) {
    if (requirement.requiredQuantity !== 1 && shape.resourceRequirements.length === 1) {
      blockers.push('quantity');
    }
    // NONE is only the stored form of the default shape: the unrestricted tenant LOCATION.
    const isDefaultLocation =
      requirement.type === 'LOCATION' && (requirement.resourcePoolIds ?? []).length === 0;
    const modeAllowed =
      RECURRING_SELECTION_MODES.has(requirement.selectionMode) ||
      (requirement.selectionMode === 'NONE' && isDefaultLocation);
    if (!modeAllowed && shape.resourceRequirements.length === 1) blockers.push('selection-mode');
  }
  if (shape.requiresPickupAddress) blockers.push('pickup-address');
  if (shape.durationPolicy === 'CUSTOMER_SELECTED') blockers.push('customer-duration');
  return blockers;
}
