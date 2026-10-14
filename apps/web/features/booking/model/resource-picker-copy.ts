import type {
  HotsiteServiceResourceOptionsRequirement,
  HotsiteServiceResponse,
  ResourceSelectionItem,
  ResourceType,
} from '@ikaro/types';
import type { PickerUnit } from './booking-steps';
import { findPick } from './resource-picks';

// What a resource-picker step says and when it may continue — the decisions, not the markup, so
// the hotsite's picker and the dashboard's say the same thing whatever they look like.

export function resourceInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export type PickHint =
  { readonly scope: 'single'; readonly resourceType: ResourceType } | { readonly scope: 'multi' };

export function pickHintOf(
  requirements: readonly HotsiteServiceResourceOptionsRequirement[],
): PickHint {
  const types = new Set<ResourceType>(requirements.map((req) => req.resourceType));
  const [only] = [...types];
  return requirements.length === 1 && only
    ? { scope: 'single', resourceType: only }
    : { scope: 'multi' };
}

type PickerHeading =
  | { readonly kind: 'leg'; readonly name: string }
  | { readonly kind: 'single'; readonly resourceType: ResourceType }
  | { readonly kind: 'multi' };

export interface PickerUnitDescription {
  readonly requirements: readonly HotsiteServiceResourceOptionsRequirement[];
  readonly heading: PickerHeading;
  /** "Leg 2 of 3" for a legged service's step; null for a flat service or bundle. */
  readonly leg: { readonly index: number; readonly total: number } | null;
  readonly allPicked: boolean;
}

/**
 * One picker step per unit: a flat service (or bundle) is one step with a section per
 * CUSTOMER_CHOICE requirement; a legged service gets a step per leg that has a choice, headed
 * with the leg name.
 */
export function describePickerUnit(
  unit: PickerUnit,
  service: HotsiteServiceResponse,
  requirements: readonly HotsiteServiceResourceOptionsRequirement[],
  picks: readonly ResourceSelectionItem[],
): PickerUnitDescription {
  const unitRequirements = requirements.filter(
    (req) => req.serviceId === unit.serviceId && (req.legIndex ?? null) === unit.legIndex,
  );
  const [first] = unitRequirements;
  const isLeg = unit.legName !== null && unit.legIndex !== null;
  let heading: PickerHeading = { kind: 'multi' };
  if (isLeg) heading = { kind: 'leg', name: unit.legName ?? '' };
  else if (unitRequirements.length === 1 && first) {
    heading = { kind: 'single', resourceType: first.resourceType };
  }
  return {
    requirements: unitRequirements,
    heading,
    leg: isLeg ? { index: (unit.legIndex ?? 0) + 1, total: service.legs?.length ?? 0 } : null,
    allPicked:
      unitRequirements.length > 0 &&
      unitRequirements.every((req) => findPick(picks, req) !== undefined),
  };
}
