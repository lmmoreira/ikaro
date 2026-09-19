import { describe, expect, it } from 'vitest';
import type { ResourceRequirementItem, ResourceResponse } from '@ikaro/types';
import { countQuantityCandidates, isQuantityUnsatisfiable } from './resource-requirement-quantity';

function staff(id: string): ResourceResponse {
  return {
    id,
    type: 'STAFF',
    refId: null,
    name: id,
    workingHours: null,
    turnoverMinutes: 0,
    maxCapacity: null,
    isActive: true,
  };
}

function requirement(
  resourcePoolIds: string[] | null,
  requiredQuantity: number,
): ResourceRequirementItem {
  return { type: 'STAFF', selectionMode: 'AUTO_ANY', resourcePoolIds, requiredQuantity };
}

const ACTIVE = [staff('a'), staff('b'), staff('c')];

describe('countQuantityCandidates', () => {
  it.each([
    ['an unset pool counts every active resource', null, 3],
    ['an empty pool is treated as unset', [], 3],
    ['an explicit pool counts only its own entries', ['a', 'b'], 2],
    ['an explicit pool ignores entries that are no longer active', ['a', 'gone'], 1],
    ['a pool whose entries all went inactive falls back to every active resource', ['gone'], 3],
  ])('%s', (_label, pool, expected) => {
    expect(countQuantityCandidates(requirement(pool, 1), ACTIVE)).toBe(expected);
  });
});

describe('isQuantityUnsatisfiable', () => {
  it('is true when the quantity exceeds the candidates, false when it fits exactly', () => {
    expect(isQuantityUnsatisfiable(requirement(['a'], 2), ACTIVE)).toBe(true);
    expect(isQuantityUnsatisfiable(requirement(['a', 'b'], 2), ACTIVE)).toBe(false);
    expect(isQuantityUnsatisfiable(requirement(null, 4), ACTIVE)).toBe(true);
  });
});
