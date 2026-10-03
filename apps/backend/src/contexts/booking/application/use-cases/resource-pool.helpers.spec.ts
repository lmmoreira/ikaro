import { filterByResourcePool, isInResourcePool } from './resource-pool.helpers';

describe('isInResourcePool', () => {
  it.each([[null], [[]]])('treats %j as unrestricted', (pool) => {
    expect(isInResourcePool(pool, 'any-id')).toBe(true);
  });

  it('restricts to the pool members when the pool is non-empty', () => {
    expect(isInResourcePool(['a', 'b'], 'a')).toBe(true);
    expect(isInResourcePool(['a', 'b'], 'c')).toBe(false);
  });
});

describe('filterByResourcePool', () => {
  const resources = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('returns every resource for a null or empty pool', () => {
    expect(filterByResourcePool(resources, null)).toEqual(resources);
    expect(filterByResourcePool(resources, [])).toEqual(resources);
  });

  it('keeps only pool members, preserving order', () => {
    expect(filterByResourcePool(resources, ['c', 'a'])).toEqual([{ id: 'a' }, { id: 'c' }]);
  });

  it('returns an empty list when no resource is in the pool', () => {
    expect(filterByResourcePool(resources, ['z'])).toEqual([]);
  });
});
