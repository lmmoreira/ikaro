import { ClassResourceSlot } from './class-resource-slot';
import {
  BookingServiceResourceTypeUnavailableError,
  ClassResourceSlotDuplicateTypeError,
  ClassResourceSlotResourceNotActiveError,
  ResourceRequirementInvalidError,
} from './errors/booking-domain.error';
import { ResourceRequirement } from './resource-requirement';
import {
  assertClassResourceSlotsAvailable,
  assertResourceRequirementsAvailable,
} from './resource-requirement-availability';
import { ResourceType } from './resource.types';

function requirement(
  type: ResourceType,
  resourcePoolIds: string[] | null = null,
): ResourceRequirement {
  return ResourceRequirement.create({ type, selectionMode: 'CUSTOMER_CHOICE', resourcePoolIds });
}

describe('assertResourceRequirementsAvailable()', () => {
  it('passes when every requirement type has at least one active resource', () => {
    expect(() =>
      assertResourceRequirementsAvailable(
        [requirement(ResourceType.STAFF)],
        new Map([[ResourceType.STAFF, new Set(['r-1'])]]),
      ),
    ).not.toThrow();
  });

  it('throws BookingServiceResourceTypeUnavailableError when a type has no active resources', () => {
    expect(() =>
      assertResourceRequirementsAvailable([requirement(ResourceType.STAFF)], new Map()),
    ).toThrow(BookingServiceResourceTypeUnavailableError);
  });

  it('throws BookingServiceResourceTypeUnavailableError when a type maps to an empty set', () => {
    expect(() =>
      assertResourceRequirementsAvailable(
        [requirement(ResourceType.STAFF)],
        new Map([[ResourceType.STAFF, new Set<string>()]]),
      ),
    ).toThrow(BookingServiceResourceTypeUnavailableError);
  });

  it('throws ResourceRequirementInvalidError for a duplicate type across requirements', () => {
    expect(() =>
      assertResourceRequirementsAvailable(
        [requirement(ResourceType.STAFF), requirement(ResourceType.STAFF)],
        new Map([[ResourceType.STAFF, new Set(['r-1'])]]),
      ),
    ).toThrow(ResourceRequirementInvalidError);
  });

  it('throws ResourceRequirementInvalidError when a resourcePoolIds entry is not an active resource', () => {
    expect(() =>
      assertResourceRequirementsAvailable(
        [requirement(ResourceType.STAFF, ['not-active'])],
        new Map([[ResourceType.STAFF, new Set(['r-1'])]]),
      ),
    ).toThrow(ResourceRequirementInvalidError);
  });

  it('passes when every resourcePoolIds entry is an active resource of the matching type', () => {
    expect(() =>
      assertResourceRequirementsAvailable(
        [requirement(ResourceType.STAFF, ['r-1', 'r-2'])],
        new Map([[ResourceType.STAFF, new Set(['r-1', 'r-2', 'r-3'])]]),
      ),
    ).not.toThrow();
  });
});

describe('assertClassResourceSlotsAvailable()', () => {
  it('passes when every slot type has at least one active resource and every eligibleResourceIds entry is active', () => {
    expect(() =>
      assertClassResourceSlotsAvailable(
        [ClassResourceSlot.create({ type: ResourceType.ROOM, eligibleResourceIds: ['r-1'] })],
        new Map([[ResourceType.ROOM, new Set(['r-1', 'r-2'])]]),
      ),
    ).not.toThrow();
  });

  it('throws ClassResourceSlotDuplicateTypeError for a duplicate type across slots', () => {
    expect(() =>
      assertClassResourceSlotsAvailable(
        [
          ClassResourceSlot.create({ type: ResourceType.ROOM, eligibleResourceIds: ['r-1'] }),
          ClassResourceSlot.create({ type: ResourceType.ROOM, eligibleResourceIds: ['r-2'] }),
        ],
        new Map([[ResourceType.ROOM, new Set(['r-1', 'r-2'])]]),
      ),
    ).toThrow(ClassResourceSlotDuplicateTypeError);
  });

  it('throws BookingServiceResourceTypeUnavailableError when a slot type has no active resources', () => {
    expect(() =>
      assertClassResourceSlotsAvailable(
        [ClassResourceSlot.create({ type: ResourceType.ROOM, eligibleResourceIds: ['r-1'] })],
        new Map(),
      ),
    ).toThrow(BookingServiceResourceTypeUnavailableError);
  });

  it('throws ClassResourceSlotResourceNotActiveError when an eligibleResourceIds entry is not active', () => {
    expect(() =>
      assertClassResourceSlotsAvailable(
        [
          ClassResourceSlot.create({
            type: ResourceType.ROOM,
            eligibleResourceIds: ['not-active'],
          }),
        ],
        new Map([[ResourceType.ROOM, new Set(['r-1'])]]),
      ),
    ).toThrow(ClassResourceSlotResourceNotActiveError);
  });
});
