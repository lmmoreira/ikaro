import { describe, expect, it } from 'vitest';
import type { ResourceType } from '@ikaro/types';
import {
  compareResourceAssignmentsByTypePriority,
  resourceTypeRank,
} from './schedule-resource-priority';

describe('resourceTypeRank', () => {
  it('orders STAFF before ROOM before EQUIPMENT', () => {
    expect(resourceTypeRank('STAFF')).toBeLessThan(resourceTypeRank('ROOM'));
    expect(resourceTypeRank('ROOM')).toBeLessThan(resourceTypeRank('EQUIPMENT'));
  });

  it('ranks an undefined or LOCATION type last', () => {
    const equipmentRank = resourceTypeRank('EQUIPMENT');
    expect(resourceTypeRank(undefined)).toBeGreaterThan(equipmentRank);
    expect(resourceTypeRank('LOCATION' as ResourceType)).toBeGreaterThan(equipmentRank);
  });
});

describe('compareResourceAssignmentsByTypePriority', () => {
  function makeAssignment(resourceType: ResourceType, resourceName: string) {
    return { resourceType, resourceName };
  }

  it('orders STAFF before ROOM before EQUIPMENT regardless of input order', () => {
    const assignments = [
      makeAssignment('EQUIPMENT', 'Secador'),
      makeAssignment('ROOM', 'Sala 2'),
      makeAssignment('STAFF', 'Camila'),
    ];
    expect(
      [...assignments].sort(compareResourceAssignmentsByTypePriority).map((a) => a.resourceName),
    ).toEqual(['Camila', 'Sala 2', 'Secador']);
  });

  it('tiebreaks alphabetically by name within the same type', () => {
    const assignments = [makeAssignment('STAFF', 'Camila'), makeAssignment('STAFF', 'Ana')];
    expect(
      [...assignments].sort(compareResourceAssignmentsByTypePriority).map((a) => a.resourceName),
    ).toEqual(['Ana', 'Camila']);
  });
});
