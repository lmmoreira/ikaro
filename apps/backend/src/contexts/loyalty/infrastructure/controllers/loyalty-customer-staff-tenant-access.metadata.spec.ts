import type { Type } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { routeAccessRequirements } from '@ikaro/nestjs-http';
import type { SuspensionAccessPolicy } from '@ikaro/types';
import type { FeatureKey } from '@ikaro/validation';
import { CustomerController } from '../../../customer/infrastructure/controllers/customer.controller';
import { StaffController } from '../../../staff/infrastructure/controllers/staff.controller';
import { LoyaltyController } from './loyalty.controller';

interface Declared {
  /** The entitlement the route resolves; `null` is `@NoFeatureGate()`. */
  feature: FeatureKey | null;
  policy: SuspensionAccessPolicy;
}

interface ControllerMapping {
  controller: Type<unknown>;
  /** What every route of the controller declares unless `overrides` names it. */
  declared: Declared;
  /** Handlers whose declaration differs from the controller's, by method name. */
  overrides: Record<string, Declared>;
  /** Fewer routes than this means the controller lost handlers (or the reader lost them). */
  minRoutes: number;
}

const LOYALTY_DENY: Declared = { feature: 'LOYALTY', policy: 'DEFAULT_DENY' };
const LOYALTY_HISTORY: Declared = { feature: 'LOYALTY', policy: 'CUSTOMER_HISTORY' };
const HOTSITE_DENY: Declared = { feature: 'HOTSITE', policy: 'DEFAULT_DENY' };
const HOTSITE_SESSION: Declared = { feature: 'HOTSITE', policy: 'ANY_AUTHENTICATED' };
const HOTSITE_SWITCH: Declared = { feature: 'HOTSITE', policy: 'AUTH_TENANT_SWITCH' };

// M25-S19: the backend route → feature / suspension-policy mapping of the Loyalty, Customer and
// Staff controllers, pinned. The detector proves a declaration exists; only this proves it is the
// right one. A route added later falls under its controller's default, or fails here until the
// controller is mapped.
const MAPPING: ControllerMapping[] = [
  {
    controller: LoyaltyController,
    declared: LOYALTY_DENY,
    overrides: {
      // The customer's own balance and history stay readable while suspended (UC-121).
      getBalance: LOYALTY_HISTORY,
      getEntries: LOYALTY_HISTORY,
      getRedemptions: LOYALTY_HISTORY,
      // A cross-tenant read behind the tenant switch list: no feature owns it, so a tenant
      // without LOYALTY must not break the list.
      getOwnBalances: { feature: null, policy: 'AUTH_TENANT_SWITCH' },
    },
    minRoutes: 9,
  },
  {
    controller: CustomerController,
    declared: HOTSITE_DENY,
    overrides: {
      getMe: HOTSITE_SESSION,
      getMyTenants: HOTSITE_SWITCH,
    },
    minRoutes: 5,
  },
  {
    controller: StaffController,
    declared: HOTSITE_DENY,
    overrides: {
      getMyProfile: HOTSITE_SESSION,
      // The BFF `ActiveStaffGuard` calls it on every staff request: default-denied, a suspended
      // tenant's staff would be rejected before any notice could render.
      getMyStatus: { feature: 'HOTSITE', policy: 'STAFF_NOTICE' },
      getMyTenants: HOTSITE_SWITCH,
    },
    minRoutes: 9,
  },
];

const reflector = new Reflector();

const rows = MAPPING.flatMap((mapping) =>
  routeAccessRequirements(mapping.controller, reflector).map((route) => ({
    controller: mapping.controller.name,
    handler: route.handler,
    requirement: route.requirement,
    expected: mapping.overrides[route.handler] ?? mapping.declared,
  })),
);

describe('Loyalty, Customer and Staff routes — tenant access mapping (M25-S19)', () => {
  it.each(MAPPING)('finds the routes of $controller.name', ({ controller, minRoutes }) => {
    expect(routeAccessRequirements(controller, reflector).length).toBeGreaterThanOrEqual(minRoutes);
  });

  it.each(MAPPING.flatMap((m) => Object.keys(m.overrides).map((h) => ({ m, handler: h }))))(
    'names a real handler for the override $m.controller.name.$handler',
    ({ m, handler }) => {
      const handlers = routeAccessRequirements(m.controller, reflector).map((r) => r.handler);

      expect(handlers).toContain(handler);
    },
  );

  it.each(rows)(
    '$controller.$handler declares the mapped feature and suspension policy',
    ({ requirement, expected }) => {
      expect(requirement).toEqual({
        feature: expected.feature ?? undefined,
        noFeatureGate: expected.feature === null ? true : undefined,
        policy: expected.policy,
      });
    },
  );

  it('maps the 23 routes of the three controllers', () => {
    expect(rows).toHaveLength(23);
  });

  it('leaves a suspended tenant exactly these routes', () => {
    const reachable = rows
      .filter((row) => row.requirement.policy !== 'DEFAULT_DENY')
      .map((row) => `${row.controller}.${row.handler}:${row.requirement.policy}`)
      .sort();

    expect(reachable).toEqual([
      'CustomerController.getMe:ANY_AUTHENTICATED',
      'CustomerController.getMyTenants:AUTH_TENANT_SWITCH',
      'LoyaltyController.getBalance:CUSTOMER_HISTORY',
      'LoyaltyController.getEntries:CUSTOMER_HISTORY',
      'LoyaltyController.getOwnBalances:AUTH_TENANT_SWITCH',
      'LoyaltyController.getRedemptions:CUSTOMER_HISTORY',
      'StaffController.getMyProfile:ANY_AUTHENTICATED',
      'StaffController.getMyStatus:STAFF_NOTICE',
      'StaffController.getMyTenants:AUTH_TENANT_SWITCH',
    ]);
  });

  it('refuses redemption while suspended', () => {
    const redeem = rows.find((row) => row.handler === 'recordRedemption');

    expect(redeem?.requirement.policy).toBe('DEFAULT_DENY');
  });
});
