import { describe, expect, it } from 'vitest';
import { isResourceCreateRoute, matchResourceRoute } from './resource-route';

describe('matchResourceRoute', () => {
  it('matches a resource edit route', () => {
    expect(matchResourceRoute('/dashboard/resources/r-1')).toEqual({
      resourceId: 'r-1',
      action: 'edit',
    });
  });

  it('matches a resource deactivate route', () => {
    expect(matchResourceRoute('/dashboard/resources/r-1/deactivate')).toEqual({
      resourceId: 'r-1',
      action: 'deactivate',
    });
  });

  it('returns null for the new route (collides structurally with [id])', () => {
    expect(matchResourceRoute('/dashboard/resources/new')).toBeNull();
  });

  it('returns null for the list route', () => {
    expect(matchResourceRoute('/dashboard/resources')).toBeNull();
  });

  it('returns null for other paths', () => {
    expect(matchResourceRoute('/dashboard/services')).toBeNull();
  });
});

describe('isResourceCreateRoute', () => {
  it('returns true only for the exact new route', () => {
    expect(isResourceCreateRoute('/dashboard/resources/new')).toBe(true);
    expect(isResourceCreateRoute('/dashboard/resources')).toBe(false);
    expect(isResourceCreateRoute('/dashboard/resources/r-1')).toBe(false);
  });
});
