import { describe, expect, it } from 'vitest';
import { resolveSuspendedPageRedirect, resolveSuspendedRedirect } from './suspended-redirect';
import type { TenantAccess } from './tenant-access';

const SUSPENDED: TenantAccess = { operational: false, features: [] };
const OPERATIONAL: TenantAccess = { operational: true, features: ['HOTSITE'] };

describe('resolveSuspendedRedirect', () => {
  it('sends a suspended manager from a protected route to the notice', () => {
    expect(
      resolveSuspendedRedirect({
        role: 'MANAGER',
        access: SUSPENDED,
        pathname: '/dashboard/bookings',
      }),
    ).toBe('/dashboard/suspended');
  });

  it.each(['/dashboard/settings', '/dashboard/loyalty/abc', '/dashboard/scheduling-exceptions'])(
    'redirects a suspended manager from %s',
    (pathname) => {
      expect(resolveSuspendedRedirect({ role: 'MANAGER', access: SUSPENDED, pathname })).toBe(
        '/dashboard/suspended',
      );
    },
  );

  it.each(['/dashboard/suspended', '/dashboard/login', '/dashboard/login/'])(
    'does not redirect from %s, so it cannot loop',
    (pathname) => {
      expect(resolveSuspendedRedirect({ role: 'MANAGER', access: SUSPENDED, pathname })).toBeNull();
    },
  );

  it('does not redirect a suspended STAFF in M25-S29 (S31a extends it)', () => {
    expect(
      resolveSuspendedRedirect({
        role: 'STAFF',
        access: SUSPENDED,
        pathname: '/dashboard/bookings',
      }),
    ).toBeNull();
  });

  it.each(['MANAGER', 'STAFF'] as const)('does not redirect an operational tenant (%s)', (role) => {
    expect(
      resolveSuspendedRedirect({ role, access: OPERATIONAL, pathname: '/dashboard/bookings' }),
    ).toBeNull();
  });

  it('does not redirect when the access read failed (fail open)', () => {
    expect(
      resolveSuspendedRedirect({ role: 'MANAGER', access: null, pathname: '/dashboard/bookings' }),
    ).toBeNull();
  });

  it('still redirects when the pathname is unknown (no x-pathname header)', () => {
    expect(resolveSuspendedRedirect({ role: 'MANAGER', access: SUSPENDED, pathname: '' })).toBe(
      '/dashboard/suspended',
    );
  });
});

describe('resolveSuspendedPageRedirect', () => {
  it('keeps a suspended manager on the notice', () => {
    expect(resolveSuspendedPageRedirect({ role: 'MANAGER', access: SUSPENDED })).toBeNull();
  });

  it('sends a manager of an operational tenant back to the dashboard', () => {
    expect(resolveSuspendedPageRedirect({ role: 'MANAGER', access: OPERATIONAL })).toBe(
      '/dashboard',
    );
  });

  it('sends a manager home when the access read failed', () => {
    expect(resolveSuspendedPageRedirect({ role: 'MANAGER', access: null })).toBe('/dashboard');
  });

  it('sends STAFF back to the dashboard until S31a adds their notice', () => {
    expect(resolveSuspendedPageRedirect({ role: 'STAFF', access: SUSPENDED })).toBe('/dashboard');
  });
});
