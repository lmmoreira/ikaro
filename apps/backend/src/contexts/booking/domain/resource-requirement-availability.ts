import { ClassResourceSlot } from './class-resource-slot';
import {
  BookingServiceResourceTypeUnavailableError,
  ClassResourceSlotBookingModelMismatchError,
  ClassResourceSlotDuplicateTypeError,
  ClassResourceSlotResourceNotActiveError,
  ResourceRequirementInvalidError,
} from './errors/booking-domain.error';
import { ResourceRequirement } from './resource-requirement';
import { ResourceType } from './resource.types';

// Canonical home for this type — service.types.ts imports it from here (not the other way
// around) so this file, service.types.ts, and service.aggregate.ts form a one-directional import
// chain with no cycle.
export type ServiceBookingModel = 'APPOINTMENT' | 'SESSION';

// classResourceSlots can only ever be supplied where bookingModel itself is set (Service.create()
// or Service.changeBookingModel()) — there is no separate slot-management endpoint in this
// milestone — so a SESSION service created/converted with none would be permanently
// un-configurable, and an APPOINTMENT service silently discarding a supplied classResourceSlots
// would surprise a caller who mistakenly sent it.
export function assertClassResourceSlotsMatchBookingModel(
  bookingModel: ServiceBookingModel,
  classResourceSlots: ClassResourceSlot[],
): void {
  if (bookingModel === 'SESSION' && classResourceSlots.length === 0) {
    throw new ClassResourceSlotBookingModelMismatchError('required-for-session');
  }
  if (bookingModel !== 'SESSION' && classResourceSlots.length > 0) {
    throw new ClassResourceSlotBookingModelMismatchError('not-allowed-for-appointment');
  }
}

// Resolved by the caller (IResourceRepository.findByTenant) — every active resource id per
// requested type, so the aggregate can validate both "does this type have any active resource"
// (UC-050 A1/UC-051) and "is this specific resourcePoolIds entry an active resource of the
// matching type" (docs/02-DOMAIN_MODEL.md's "subset of active resources" definition) without
// touching a repository itself.
export type ActiveResourceIdsByType = ReadonlyMap<ResourceType, ReadonlySet<string>>;

// Shared by Service.setResourceRequirements() (flat) and Service.setLegs() (once per leg's own
// nested requirements) — the same DB-level invariant applies at both levels: UNIQUE(tenant_id,
// service_id, resource_type) / UNIQUE(tenant_id, leg_id, resource_type) both reject a duplicate
// type as an uncaught DB error unless rejected here first with a domain-level 422.
export function assertResourceRequirementsAvailable(
  requirements: ResourceRequirement[],
  activeResourceIdsByType: ActiveResourceIdsByType,
): void {
  const types = requirements.map((r) => r.type);
  if (new Set(types).size !== types.length) {
    throw new ResourceRequirementInvalidError('duplicate-type');
  }
  for (const requirement of requirements) {
    assertRequirementAvailable(requirement, activeResourceIdsByType);
  }
}

function assertRequirementAvailable(
  requirement: ResourceRequirement,
  activeResourceIdsByType: ActiveResourceIdsByType,
): void {
  const activeIds = activeResourceIdsByType.get(requirement.type);
  if (!activeIds || activeIds.size === 0) {
    throw new BookingServiceResourceTypeUnavailableError(requirement.type);
  }
  for (const poolId of requirement.resourcePoolIds ?? []) {
    if (!activeIds.has(poolId)) {
      throw new ResourceRequirementInvalidError('pool-id-not-active');
    }
  }
}

// Same shape of check as assertResourceRequirementsAvailable() above, applied to a SESSION
// service's classResourceSlots (UC-056 step 3: "same eligibility checklist as UC-050's flat
// case") — service_class_resource_pool has no separate "slot" identity, so an inactive/wrong-
// tenant eligibleResourceIds entry would otherwise either persist silently or hit the table's
// composite FK as an unhandled error.
export function assertClassResourceSlotsAvailable(
  slots: ClassResourceSlot[],
  activeResourceIdsByType: ActiveResourceIdsByType,
): void {
  const slotTypes = slots.map((s) => s.type);
  if (new Set(slotTypes).size !== slotTypes.length) {
    throw new ClassResourceSlotDuplicateTypeError();
  }
  for (const slot of slots) {
    const activeIds = activeResourceIdsByType.get(slot.type);
    if (!activeIds || activeIds.size === 0) {
      throw new BookingServiceResourceTypeUnavailableError(slot.type);
    }
    for (const resourceId of slot.eligibleResourceIds) {
      if (!activeIds.has(resourceId)) {
        throw new ClassResourceSlotResourceNotActiveError();
      }
    }
  }
}
