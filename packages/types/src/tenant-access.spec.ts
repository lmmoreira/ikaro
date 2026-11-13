import { ACTOR_ROLES, type ActorRole } from './enums';
import {
  SUSPENSION_ACCESS_POLICIES,
  SUSPENSION_POLICIES,
  evaluateTenantAccess,
  isAdmittedWhileSuspended,
  type SuspensionAccessPolicy,
  type TenantAccessView,
} from './tenant-access';

// The roles each policy admits while suspended, written out by hand: a policy added to the table
// without a row here fails the coverage test below, so one cannot be added half-wired.
const EXPECTED: Record<SuspensionAccessPolicy, readonly (ActorRole | undefined)[]> = {
  DEFAULT_DENY: [],
  MANAGER_BILLING: ['MANAGER'],
  STAFF_NOTICE: ['STAFF', 'MANAGER'],
  CUSTOMER_HISTORY: ['CUSTOMER'],
  AUTH_TENANT_SWITCH: ['CUSTOMER', 'STAFF', 'MANAGER'],
  ANY_AUTHENTICATED: ['CUSTOMER', 'STAFF', 'MANAGER'],
  PUBLIC_MANIFEST: ['CUSTOMER', 'STAFF', 'MANAGER', undefined],
  PUBLIC_NONE: [],
};

const CALLERS: readonly (ActorRole | undefined)[] = [...ACTOR_ROLES, undefined];
const SUSPENDED = { operational: false, features: [{ key: 'BOOKING' }] };
const OPERATIONAL = { operational: true, features: [{ key: 'BOOKING' }] };

describe('SUSPENSION_POLICIES', () => {
  it('has an expected-behaviour row for every policy and no stale row', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...SUSPENSION_ACCESS_POLICIES].sort());
    expect(SUSPENSION_ACCESS_POLICIES).toEqual(Object.keys(SUSPENSION_POLICIES));
  });

  describe.each(SUSPENSION_ACCESS_POLICIES)('%s', (policy) => {
    it.each(CALLERS)('admits exactly its roles while suspended (caller %s)', (role) => {
      expect(isAdmittedWhileSuspended(policy, role)).toBe(EXPECTED[policy].includes(role));
    });
  });
});

describe('evaluateTenantAccess', () => {
  it('allows an operational tenant on a route with no metadata', () => {
    expect(evaluateTenantAccess(OPERATIONAL, {}, 'MANAGER')).toBe('ALLOW');
  });

  it('denies a suspended tenant on a route with no metadata (the default policy)', () => {
    expect(evaluateTenantAccess(SUSPENDED, {}, 'MANAGER')).toBe('TENANT_SUSPENDED');
  });

  it('allows an entitled feature and denies one the tenant lacks', () => {
    expect(evaluateTenantAccess(OPERATIONAL, { feature: 'BOOKING' }, 'STAFF')).toBe('ALLOW');
    expect(evaluateTenantAccess(OPERATIONAL, { feature: 'CHATBOT' }, 'STAFF')).toBe(
      'FEATURE_NOT_ENTITLED',
    );
  });

  it('@NoFeatureGate skips the entitlement check only', () => {
    const gate = { feature: 'CHATBOT', noFeatureGate: true };
    expect(evaluateTenantAccess(OPERATIONAL, gate, 'STAFF')).toBe('ALLOW');
    // …but never the suspension policy: denied with the default, allowed once a policy admits it
    expect(evaluateTenantAccess(SUSPENDED, gate, 'STAFF')).toBe('TENANT_SUSPENDED');
    expect(
      evaluateTenantAccess(
        SUSPENDED,
        { noFeatureGate: true, policy: 'ANY_AUTHENTICATED' },
        'CUSTOMER',
      ),
    ).toBe('ALLOW');
  });

  it('admits only the policy roles while suspended (a staff caller of CUSTOMER_HISTORY is denied)', () => {
    const route = { policy: 'CUSTOMER_HISTORY' } as const;
    expect(evaluateTenantAccess(SUSPENDED, route, 'CUSTOMER')).toBe('ALLOW');
    expect(evaluateTenantAccess(SUSPENDED, route, 'STAFF')).toBe('TENANT_SUSPENDED');
    expect(evaluateTenantAccess(SUSPENDED, route, undefined)).toBe('TENANT_SUSPENDED');
  });

  it('keeps PUBLIC_MANIFEST reachable and refuses PUBLIC_NONE for a suspended tenant', () => {
    expect(evaluateTenantAccess(SUSPENDED, { policy: 'PUBLIC_MANIFEST' }, undefined)).toBe('ALLOW');
    expect(evaluateTenantAccess(SUSPENDED, { policy: 'PUBLIC_NONE' }, undefined)).toBe(
      'TENANT_SUSPENDED',
    );
  });

  // A suspended tenant holds no entitled feature (`Subscription.entitledAt` returns none), so the
  // real answer for it carries `features: []`; a route a policy admits must still be reachable.
  const SUSPENDED_REAL: TenantAccessView = { operational: false, features: [] };

  it('lets a route its policy admits answer for a suspended tenant that holds no feature', () => {
    const manifest = { feature: 'HOTSITE', policy: 'PUBLIC_MANIFEST' } as const;
    expect(evaluateTenantAccess(SUSPENDED_REAL, manifest, undefined)).toBe('ALLOW');
    const history = { feature: 'LOYALTY', policy: 'CUSTOMER_HISTORY' } as const;
    expect(evaluateTenantAccess(SUSPENDED_REAL, history, 'CUSTOMER')).toBe('ALLOW');
  });

  it('still refuses a suspended tenant on a route whose policy does not admit the caller', () => {
    const history = { feature: 'LOYALTY', policy: 'CUSTOMER_HISTORY' } as const;
    expect(evaluateTenantAccess(SUSPENDED_REAL, history, 'STAFF')).toBe('TENANT_SUSPENDED');
    expect(evaluateTenantAccess(SUSPENDED_REAL, { feature: 'HOTSITE' }, 'MANAGER')).toBe(
      'TENANT_SUSPENDED',
    );
  });
});
