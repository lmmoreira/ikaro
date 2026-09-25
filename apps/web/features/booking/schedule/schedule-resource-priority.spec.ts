import { describe, expect, it } from 'vitest';
import type { ResourceType } from '@ikaro/types';
import { compareResourceIdsByTypePriority, resourceTypeRank } from './schedule-resource-priority';

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

describe('compareResourceIdsByTypePriority', () => {
  const resourceNameById = new Map([
    ['staff-camila', 'Camila'],
    ['staff-ana', 'Ana'],
    ['room-2', 'Sala 2'],
    ['equip-dryer', 'Secador'],
  ]);
  const resourceTypeById = new Map<string, ResourceType>([
    ['staff-camila', 'STAFF'],
    ['staff-ana', 'STAFF'],
    ['room-2', 'ROOM'],
    ['equip-dryer', 'EQUIPMENT'],
  ]);
  const compare = compareResourceIdsByTypePriority(resourceNameById, resourceTypeById);

  it('orders STAFF before ROOM before EQUIPMENT regardless of input order', () => {
    const ids = ['equip-dryer', 'room-2', 'staff-camila'];
    expect([...ids].sort(compare)).toEqual(['staff-camila', 'room-2', 'equip-dryer']);
  });

  it('tiebreaks alphabetically by name within the same type', () => {
    const ids = ['staff-camila', 'staff-ana'];
    expect([...ids].sort(compare)).toEqual(['staff-ana', 'staff-camila']);
  });

  it('falls back to the raw id when a name is missing, without throwing', () => {
    const ids = ['staff-camila', 'unknown-id'];
    const typeById = new Map<string, ResourceType>([
      ['staff-camila', 'STAFF'],
      ['unknown-id', 'STAFF'],
    ]);
    const compareWithMissingName = compareResourceIdsByTypePriority(resourceNameById, typeById);
    expect(() => [...ids].sort(compareWithMissingName)).not.toThrow();
  });
});
