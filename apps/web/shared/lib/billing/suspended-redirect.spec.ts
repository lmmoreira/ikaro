import { describe, expect, it } from 'vitest';
import { resolveSuspendedPageRedirect, resolveSuspendedRedirect } from './suspended-redirect';
import type { TenantAccess } from './tenant-access';

const SUSPENDED: TenantAccess = { operational: false, features: [] };
const OPERATIONAL: TenantAccess = { operational: true, features: ['HOTSITE'] };

describe('resolveSuspendedRedirect', () => {
  it('sends a user of a suspended tenant from a protected route to the notice', () => {
    expect(resolveSuspendedRedirect({ access: SUSPENDED, pathname: '/dashboard/bookings' })).toBe(
      '/dashboard/suspended',
    );
  });

  it.each(['/dashboard/settings', '/dashboard/loyalty/abc', '/dashboard/scheduling-exceptions'])(
    'redirects from %s',
    (pathname) => {
      expect(resolveSuspendedRedirect({ access: SUSPENDED, pathname })).toBe(
        '/dashboard/suspended',
      );
    },
  );

  it.each(['/dashboard/suspended', '/dashboard/login', '/dashboard/login/'])(
    'does not redirect from %s, so it cannot loop',
    (pathname) => {
      expect(resolveSuspendedRedirect({ access: SUSPENDED, pathname })).toBeNull();
    },
  );

  it('does not redirect an operational tenant', () => {
    expect(
      resolveSuspendedRedirect({ access: OPERATIONAL, pathname: '/dashboard/bookings' }),
    ).toBeNull();
  });

  it('does not redirect when the access read failed (fail open)', () => {
    expect(resolveSuspendedRedirect({ access: null, pathname: '/dashboard/bookings' })).toBeNull();
  });

  it('still redirects when the pathname is unknown (no x-pathname header)', () => {
    expect(resolveSuspendedRedirect({ access: SUSPENDED, pathname: '' })).toBe(
      '/dashboard/suspended',
    );
  });
});

describe('resolveSuspendedPageRedirect', () => {
  it('keeps a user of a suspended tenant on the notice', () => {
    expect(resolveSuspendedPageRedirect({ access: SUSPENDED })).toBeNull();
  });

  it('sends a user of an operational tenant back to the dashboard', () => {
    expect(resolveSuspendedPageRedirect({ access: OPERATIONAL })).toBe('/dashboard');
  });

  it('sends the user home when the access read failed', () => {
    expect(resolveSuspendedPageRedirect({ access: null })).toBe('/dashboard');
  });
});
