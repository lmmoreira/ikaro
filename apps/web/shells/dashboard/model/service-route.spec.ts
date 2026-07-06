import { describe, expect, it } from 'vitest';
import { isServiceCreateRoute, matchServiceRoute } from './service-route';

describe('matchServiceRoute', () => {
  it('matches edit routes', () => {
    expect(matchServiceRoute('/dashboard/services/svc-1/edit')).toEqual({
      serviceId: 'svc-1',
      action: 'edit',
    });
  });

  it('matches deactivate routes', () => {
    expect(matchServiceRoute('/dashboard/services/svc-1/deactivate')).toEqual({
      serviceId: 'svc-1',
      action: 'deactivate',
    });
  });

  it('returns null for other paths', () => {
    expect(matchServiceRoute('/dashboard/services')).toBeNull();
    expect(matchServiceRoute('/dashboard/services/new')).toBeNull();
  });
});

describe('isServiceCreateRoute', () => {
  it('returns true only for the exact create route', () => {
    expect(isServiceCreateRoute('/dashboard/services/new')).toBe(true);
    expect(isServiceCreateRoute('/dashboard/services')).toBe(false);
    expect(isServiceCreateRoute('/dashboard/services/svc-1/edit')).toBe(false);
  });
});
