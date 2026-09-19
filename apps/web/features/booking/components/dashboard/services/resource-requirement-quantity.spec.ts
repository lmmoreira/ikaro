import { describe, expect, it } from 'vitest';
import type { ResourceRequirementItem, ResourceResponse } from '@ikaro/types';
import {
  countQuantityCandidates,
  hasStaleEligiblePool,
  hasUnsatisfiableRequirement,
  isQuantityUnsatisfiable,
} from './resource-requirement-quantity';

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
    ['a pool whose entries all went inactive has no usable candidates', ['gone'], 0],
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

describe('hasStaleEligiblePool', () => {
  it.each([
    ['an unset pool is never stale', null, false],
    ['an empty pool is never stale', [], false],
    ['a pool with at least one active resource is not stale', ['a', 'gone'], false],
    ['a pool whose every entry went inactive is stale', ['gone', 'also-gone'], true],
  ])('%s', (_label, pool, expected) => {
    expect(hasStaleEligiblePool(requirement(pool, 1), ACTIVE)).toBe(expected);
  });

  it('treats a stale pool as unsatisfiable so the save stays blocked', () => {
    expect(isQuantityUnsatisfiable(requirement(['gone'], 1), ACTIVE)).toBe(true);
  });
});

describe('hasUnsatisfiableRequirement', () => {
  const availableByType = () => ACTIVE;

  it('is false when every requirement fits its candidates', () => {
    expect(
      hasUnsatisfiableRequirement(
        [requirement(null, 2), requirement(['a', 'b'], 2)],
        availableByType,
      ),
    ).toBe(false);
  });

  it('is true when any single requirement cannot be satisfied', () => {
    expect(
      hasUnsatisfiableRequirement(
        [requirement(null, 1), requirement(['gone'], 1)],
        availableByType,
      ),
    ).toBe(true);
  });

  it('is false for no requirements at all', () => {
    expect(hasUnsatisfiableRequirement([], availableByType)).toBe(false);
  });
});
