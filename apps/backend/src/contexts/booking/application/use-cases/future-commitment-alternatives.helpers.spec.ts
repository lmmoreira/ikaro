import { ServiceBuilder } from '../../../../test/builders/booking/index';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { ServiceLeg } from '../../domain/service-leg';
import { findRequirementForAssignment, isInPool } from './future-commitment-alternatives.helpers';

const flat = ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' });
const legRoom = ResourceRequirement.create({
  type: ResourceType.ROOM,
  selectionMode: 'AUTO_ANY',
  resourcePoolIds: ['room-1'],
});
const legStaff = ResourceRequirement.create({
  type: ResourceType.STAFF,
  selectionMode: 'AUTO_ANY',
});

describe('findRequirementForAssignment', () => {
  it("returns a flat service's requirement of the assigned type", () => {
    const service = new ServiceBuilder().withResourceRequirements([flat]).build();

    expect(findRequirementForAssignment(service, null, ResourceType.ROOM)).toBe(flat);
  });

  it("returns the named leg's requirement of the assigned type", () => {
    const service = new ServiceBuilder()
      .withLegs([
        ServiceLeg.create({
          legIndex: 0,
          name: 'Prep',
          durationMinutes: 30,
          resourceRequirements: [legStaff],
        }),
        ServiceLeg.create({
          legIndex: 1,
          name: 'Sessão',
          durationMinutes: 30,
          resourceRequirements: [legRoom],
        }),
      ])
      .build();

    expect(findRequirementForAssignment(service, 1, ResourceType.ROOM)).toBe(legRoom);
    expect(findRequirementForAssignment(service, 0, ResourceType.STAFF)).toBe(legStaff);
  });

  it('returns null when the service is unknown, the leg is missing or the type is not required', () => {
    const service = new ServiceBuilder().withResourceRequirements([flat]).build();

    expect(findRequirementForAssignment(undefined, null, ResourceType.ROOM)).toBeNull();
    expect(findRequirementForAssignment(service, 3, ResourceType.ROOM)).toBeNull();
    expect(findRequirementForAssignment(service, null, ResourceType.EQUIPMENT)).toBeNull();
  });
});

describe('isInPool', () => {
  it.each([
    [null, true],
    [[], true],
    [['a', 'b'], true],
  ])('treats %j as containing "a"', (pool, expected) => {
    expect(isInPool(pool as string[] | null, 'a')).toBe(expected);
  });

  it('excludes a resource outside a non-empty pool', () => {
    expect(isInPool(['a', 'b'], 'c')).toBe(false);
  });
});
