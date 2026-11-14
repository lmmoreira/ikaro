import type { Type } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { routeAccessRequirements } from '@ikaro/nestjs-http';
import type { SuspensionAccessPolicy } from '@ikaro/types';
import type { FeatureKey } from '@ikaro/validation';
import { CustomersController } from '../customer/customers.controller';
import { StaffController } from '../staff/staff.controller';
import { LoyaltyController } from './loyalty.controller';

interface Declared {
  feature: FeatureKey;
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

// M25-S19: the BFF route → feature / suspension-policy mapping of the Loyalty, Customer and Staff
// controllers, pinned. The detector proves a declaration exists; only this proves it is the right
// one. A route added later falls under its controller's default, or fails here until the
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
    },
    minRoutes: 8,
  },
  {
    controller: CustomersController,
    declared: HOTSITE_DENY,
    overrides: {
      // `GET /auth/session` and the profile read call `GET /customers/me` for a customer.
      getProfile: HOTSITE_SESSION,
      // The tenant switch list, which also reads every tenant the customer belongs to.
      getTenants: HOTSITE_SWITCH,
    },
    minRoutes: 5,
  },
  {
    controller: StaffController,
    declared: HOTSITE_DENY,
    overrides: {
      // `GET /auth/session` and `GET /v1/staff/me` call `GET /staff/me` for staff and managers.
      getMe: HOTSITE_SESSION,
    },
    minRoutes: 7,
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

describe('BFF Loyalty, Customer and Staff routes — tenant access mapping (M25-S19)', () => {
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
        feature: expected.feature,
        noFeatureGate: undefined,
        policy: expected.policy,
      });
    },
  );

  it('maps the 20 routes of the three controllers', () => {
    expect(rows).toHaveLength(20);
  });

  it('leaves a suspended tenant exactly these routes', () => {
    const reachable = rows
      .filter((row) => row.requirement.policy !== 'DEFAULT_DENY')
      .map((row) => `${row.controller}.${row.handler}:${row.requirement.policy}`)
      .sort();

    expect(reachable).toEqual([
      'CustomersController.getProfile:ANY_AUTHENTICATED',
      'CustomersController.getTenants:AUTH_TENANT_SWITCH',
      'LoyaltyController.getBalance:CUSTOMER_HISTORY',
      'LoyaltyController.getEntries:CUSTOMER_HISTORY',
      'LoyaltyController.getRedemptions:CUSTOMER_HISTORY',
      'StaffController.getMe:ANY_AUTHENTICATED',
    ]);
  });

  it('refuses redemption while suspended', () => {
    const redeem = rows.find((row) => row.handler === 'redeemPoints');

    expect(redeem?.requirement.policy).toBe('DEFAULT_DENY');
  });
});
