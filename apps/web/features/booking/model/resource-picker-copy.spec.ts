import { describe, expect, it } from 'vitest';
import type { HotsiteServiceResourceOptionsRequirement } from '@ikaro/types';
import { makeHotsiteService } from '@/test-utils';
import { pickerUnitKey, type PickerUnit } from './booking-steps';
import { describePickerUnit, pickHintOf, resourceInitials } from './resource-picker-copy';

function requirement(
  resourceType: 'STAFF' | 'ROOM',
  legIndex: number | null = null,
): HotsiteServiceResourceOptionsRequirement {
  return {
    serviceId: 'svc',
    legIndex,
    resourceType,
    selectionMode: 'CUSTOMER_CHOICE',
    requiredQuantity: 1,
    options: [{ resourceId: `${resourceType}-1`, name: 'Ana' }],
  };
}

const FLAT_UNIT: PickerUnit = {
  key: pickerUnitKey('svc', null),
  serviceId: 'svc',
  legIndex: null,
  legName: null,
};

describe('resourceInitials', () => {
  it('is the first letters of the first two words, upper-cased', () => {
    expect(resourceInitials('ana souza lima')).toBe('AS');
    expect(resourceInitials('  maria ')).toBe('M');
    expect(resourceInitials('')).toBe('');
  });
});

describe('pickHintOf', () => {
  it('is single for exactly one requirement and multi for several', () => {
    expect(pickHintOf([requirement('STAFF')])).toEqual({ scope: 'single', resourceType: 'STAFF' });
    expect(pickHintOf([requirement('STAFF'), requirement('ROOM')])).toEqual({ scope: 'multi' });
  });
});

describe('describePickerUnit', () => {
  const service = makeHotsiteService({ id: 'svc' });

  it('headed by the resource type for a single requirement, and gated on every pick', () => {
    const required = requirement('STAFF');
    const none = describePickerUnit(FLAT_UNIT, service, [required], []);
    const picked = describePickerUnit(
      FLAT_UNIT,
      service,
      [required],
      [{ serviceId: 'svc', resourceType: 'STAFF', resourceId: 'STAFF-1' }],
    );

    expect(none.heading).toEqual({ kind: 'single', resourceType: 'STAFF' });
    expect(none.leg).toBeNull();
    expect(none.allPicked).toBe(false);
    expect(picked.allPicked).toBe(true);
  });

  it('is multi for a bundle and only needs the unit’s own requirements', () => {
    const description = describePickerUnit(
      FLAT_UNIT,
      service,
      [requirement('STAFF'), requirement('ROOM'), requirement('ROOM', 1)],
      [],
    );

    expect(description.heading).toEqual({ kind: 'multi' });
    expect(description.requirements).toHaveLength(2);
  });

  it('names the leg and its position for a legged service', () => {
    const legged = makeHotsiteService({
      id: 'svc',
      legs: [
        {
          legIndex: 0,
          name: 'Sauna',
          durationMinutes: 30,
          transitionGapAfterMinutes: 0,
          resourceRequirements: [],
        },
        {
          legIndex: 1,
          name: 'Massagem',
          durationMinutes: 50,
          transitionGapAfterMinutes: 0,
          resourceRequirements: [],
        },
      ],
    });
    const unit: PickerUnit = {
      key: pickerUnitKey('svc', 1),
      serviceId: 'svc',
      legIndex: 1,
      legName: 'Massagem',
    };

    const description = describePickerUnit(unit, legged, [requirement('STAFF', 1)], []);

    expect(description.heading).toEqual({ kind: 'leg', name: 'Massagem' });
    expect(description.leg).toEqual({ index: 2, total: 2 });
  });

  it('is never picked when the unit has no requirements', () => {
    expect(describePickerUnit(FLAT_UNIT, service, [], []).allPicked).toBe(false);
  });
});
