import { describe, expect, it } from 'vitest';
import { isResourceCreateRoute, matchResourceRoute } from './resource-route';

describe('matchResourceRoute', () => {
  it('matches the edit route (bare /:id, no /edit suffix)', () => {
    expect(matchResourceRoute('/dashboard/resources/res-1')).toEqual({
      resourceId: 'res-1',
      action: 'edit',
    });
  });

  it('matches deactivate routes', () => {
    expect(matchResourceRoute('/dashboard/resources/res-1/deactivate')).toEqual({
      resourceId: 'res-1',
      action: 'deactivate',
    });
  });

  it('returns null for the list and create routes', () => {
    expect(matchResourceRoute('/dashboard/resources')).toBeNull();
    expect(matchResourceRoute('/dashboard/resources/new')).toBeNull();
  });

  it('returns null for a different section entirely', () => {
    expect(matchResourceRoute('/dashboard/services')).toBeNull();
  });
});

describe('isResourceCreateRoute', () => {
  it('returns true only for the exact create route', () => {
    expect(isResourceCreateRoute('/dashboard/resources/new')).toBe(true);
    expect(isResourceCreateRoute('/dashboard/resources')).toBe(false);
    expect(isResourceCreateRoute('/dashboard/resources/res-1')).toBe(false);
    expect(isResourceCreateRoute('/dashboard/resources/res-1/deactivate')).toBe(false);
  });
});
