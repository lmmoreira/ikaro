import type { Type } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { routeAccessRequirements } from '@ikaro/nestjs-http';
import type { SuspensionAccessPolicy } from '@ikaro/types';
import { HealthController } from '../../health/health.controller';
import { BillingController } from '../billing/billing.controller';
import { AuthController } from './auth.controller';

interface ControllerMapping {
  controller: Type<unknown>;
  /** The suspension policy of every route unless `overrides` names it. */
  policy: SuspensionAccessPolicy;
  /** Handlers whose policy differs from the controller's, by method name. */
  overrides: Record<string, SuspensionAccessPolicy>;
  /** Fewer routes than this means the controller lost handlers (or the reader lost them). */
  minRoutes: number;
}

// M25-S20: the BFF surface no sellable feature owns. Every route is `@NoFeatureGate()`. The public
// auth routes and health are `PUBLIC_ALWAYS` (a suspended tenant's users must always be able to
// sign in and out); `GET /auth/session` and the billing access read are `ANY_AUTHENTICATED`; the
// tenant switch routes are `AUTH_TENANT_SWITCH`. The detector proves a declaration exists; only
// this proves it is the right one.
const MAPPING: ControllerMapping[] = [
  {
    controller: AuthController,
    policy: 'PUBLIC_ALWAYS',
    overrides: {
      getSession: 'ANY_AUTHENTICATED',
      getStaffTenants: 'AUTH_TENANT_SWITCH',
      switchStaffTenant: 'AUTH_TENANT_SWITCH',
      switchTenant: 'AUTH_TENANT_SWITCH',
    },
    minRoutes: 8,
  },
  { controller: HealthController, policy: 'PUBLIC_ALWAYS', overrides: {}, minRoutes: 2 },
  // Annotated in M25-S16; verified here so a regression of the gate's own lookup fails a spec.
  { controller: BillingController, policy: 'ANY_AUTHENTICATED', overrides: {}, minRoutes: 1 },
];

const reflector = new Reflector();

const rows = MAPPING.flatMap((mapping) =>
  routeAccessRequirements(mapping.controller, reflector).map((route) => ({
    controller: mapping.controller.name,
    handler: route.handler,
    requirement: route.requirement,
    expected: mapping.overrides[route.handler] ?? mapping.policy,
  })),
);

describe('BFF auth, health and billing access routes — tenant access mapping (M25-S20)', () => {
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
    '$controller.$handler is NoFeatureGate with the mapped suspension policy',
    ({ requirement, expected }) => {
      expect(requirement).toEqual({
        feature: undefined,
        noFeatureGate: true,
        policy: expected,
      });
    },
  );

  it('maps the 11 routes of the three controllers', () => {
    expect(rows).toHaveLength(11);
  });

  it('declares the four public auth routes PUBLIC_ALWAYS', () => {
    const publicRoutes = rows
      .filter((row) => row.controller === 'AuthController' && row.expected === 'PUBLIC_ALWAYS')
      .map((row) => row.handler)
      .sort();

    expect(publicRoutes).toEqual(['devLogin', 'handleGoogleCallback', 'login', 'logout']);
  });
});
