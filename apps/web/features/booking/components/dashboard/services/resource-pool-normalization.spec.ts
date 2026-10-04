import { describe, expect, it } from 'vitest';
import type { ResourceRequirementItem, ResourceResponse, ServiceLegItem } from '@ikaro/types';
import {
  normalizeLegsResourcePoolIds,
  normalizeResourcePoolIds,
} from './resource-pool-normalization';

function resource(id: string, type: ResourceResponse['type']): ResourceResponse {
  return {
    id,
    type,
    refId: null,
    name: id,
    workingHours: null,
    turnoverMinutes: 0,
    maxCapacity: null,
    isActive: true,
  };
}

const requirement = (resourcePoolIds: string[] | null): ResourceRequirementItem => ({
  type: 'ROOM',
  selectionMode: 'AUTO_ANY',
  resourcePoolIds,
  requiredQuantity: 1,
});

describe('normalizeResourcePoolIds', () => {
  const available = [resource('room-1', 'ROOM'), resource('staff-1', 'STAFF')];

  it('leaves a requirement without a pool untouched', () => {
    const open = requirement(null);
    expect(normalizeResourcePoolIds(open, available)).toBe(open);
  });

  it('drops pool ids that are not active resources of the same type', () => {
    expect(normalizeResourcePoolIds(requirement(['room-1', 'gone', 'staff-1']), available)).toEqual(
      requirement(['room-1']),
    );
  });
});

describe('normalizeLegsResourcePoolIds', () => {
  it('normalizes every requirement of every leg', () => {
    const legs: ServiceLegItem[] = [
      {
        legIndex: 0,
        name: 'Sauna',
        durationMinutes: 20,
        resourceRequirements: [requirement(['room-1', 'gone'])],
        transitionGapAfterMinutes: 0,
      },
    ];

    const [leg] = normalizeLegsResourcePoolIds(legs, [resource('room-1', 'ROOM')]);

    expect(leg.resourceRequirements[0].resourcePoolIds).toEqual(['room-1']);
  });
});
