import { describe, expect, it } from 'vitest';
import type { HotsiteServiceResourceOptionsRequirement, ResourceSelectionItem } from '@ikaro/types';
import {
  findPick,
  isRequirementPicked,
  orderPicks,
  removeInvalidPicks,
  setPick,
  toResourceSelectionItem,
} from './resource-picks';

const requirement = (
  overrides: Partial<HotsiteServiceResourceOptionsRequirement> = {},
): HotsiteServiceResourceOptionsRequirement => ({
  serviceId: 's1',
  legIndex: null,
  resourceType: 'STAFF',
  selectionMode: 'CUSTOMER_CHOICE',
  requiredQuantity: 1,
  options: [
    { resourceId: 'r1', name: 'Ana' },
    { resourceId: 'r2', name: 'Bia' },
  ],
  ...overrides,
});

const pick = (overrides: Partial<ResourceSelectionItem> = {}): ResourceSelectionItem => ({
  serviceId: 's1',
  legIndex: null,
  resourceType: 'STAFF',
  resourceId: 'r1',
  ...overrides,
});

describe('resource picks', () => {
  it('replaces the pick of the same target and keeps the others', () => {
    const picks = setPick(
      [pick(), pick({ resourceType: 'ROOM', resourceId: 'room' })],
      pick({ resourceId: 'r2' }),
    );
    expect(findPick(picks, requirement())).toBe('r2');
    expect(findPick(picks, requirement({ resourceType: 'ROOM' }))).toBe('room');
  });

  it('keeps one pick per leg for the same resource type', () => {
    const picks = setPick(
      setPick([], pick({ legIndex: 1 })),
      pick({ legIndex: 2, resourceId: 'r2' }),
    );
    expect(findPick(picks, requirement({ legIndex: 1 }))).toBe('r1');
    expect(findPick(picks, requirement({ legIndex: 2 }))).toBe('r2');
  });

  it('builds a selection item from a requirement', () => {
    expect(toResourceSelectionItem(requirement({ legIndex: 3 }), 'r2')).toEqual(
      pick({ legIndex: 3, resourceId: 'r2' }),
    );
  });

  it('orders picks by serviceIds order, then leg, then resource type', () => {
    const ordered = orderPicks(
      [pick({ serviceId: 's2' }), pick({ resourceType: 'ROOM' }), pick({ legIndex: 1 }), pick()],
      ['s1', 's2'],
    );
    expect(ordered.map((p) => `${p.serviceId}/${p.legIndex}/${p.resourceType}`)).toEqual([
      's1/null/STAFF',
      's1/null/ROOM',
      's1/1/STAFF',
      's2/null/STAFF',
    ]);
  });

  it('removes a pick that is no longer among the options', () => {
    const kept = removeInvalidPicks(
      [pick(), pick({ resourceType: 'ROOM', resourceId: 'gone' })],
      [requirement(), requirement({ resourceType: 'ROOM' })],
    );
    expect(kept).toEqual([pick()]);
  });

  it('removes a pick whose requirement no longer exists', () => {
    expect(removeInvalidPicks([pick()], [])).toEqual([]);
  });

  it('reports whether a requirement has a pick', () => {
    expect(isRequirementPicked([pick()], requirement())).toBe(true);
    expect(isRequirementPicked([], requirement())).toBe(false);
  });
});
