import type { Type } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { routeAccessRequirements } from '@ikaro/nestjs-http';
import type { SuspensionAccessPolicy } from '@ikaro/types';
import type { FeatureKey } from '@ikaro/validation';
import { BookingsAttachmentsController } from './bookings-attachments.controller';
import { BookingsGuestController } from './bookings-guest.controller';
import { BookingsNoShowController } from './bookings-no-show.controller';
import { BookingsController } from './bookings.controller';

interface Declared {
  feature: FeatureKey;
  policy: SuspensionAccessPolicy;
}

interface ControllerMapping {
  controller: Type<unknown>;
  /** What every route of the controller declares unless `routes` says otherwise. */
  default: Declared;
  /** The handlers that differ from the default. */
  routes?: Record<string, Declared>;
  /** Fewer routes than this means the controller lost handlers (or the reader lost them). */
  minRoutes: number;
}

const DENY: Declared = { feature: 'BOOKING', policy: 'DEFAULT_DENY' };
const HISTORY: Declared = { feature: 'BOOKING', policy: 'CUSTOMER_HISTORY' };
const PUBLIC: Declared = { feature: 'BOOKING', policy: 'PUBLIC_NONE' };

// M25-S18a: the BFF booking and lifecycle route → feature / suspension-policy mapping, pinned.
// The detector proves a declaration exists; only this proves it is the right one. A route added
// later is covered by its controller's default, or fails here until it is mapped.
const MAPPING: ControllerMapping[] = [
  {
    controller: BookingsController,
    default: DENY,
    // UC-121: the customer's booking list and the cancel of a future booking stay reachable while
    // suspended, customer role only (a staff caller is refused at the BFF). Creating a booking as
    // a guest is public. The detail read (`getOne`) stays DEFAULT_DENY.
    routes: { list: HISTORY, cancel: HISTORY, create: PUBLIC },
    minRoutes: 12,
  },
  // The guest routes carry their tenant in a guest token, which the BFF guard does not read: the
  // declaration documents the intent and the backend gate does the refusing.
  { controller: BookingsGuestController, default: PUBLIC, minRoutes: 2 },
  { controller: BookingsAttachmentsController, default: PUBLIC, minRoutes: 1 },
  { controller: BookingsNoShowController, default: DENY, minRoutes: 2 },
];

const reflector = new Reflector();

const rows = MAPPING.flatMap((mapping) =>
  routeAccessRequirements(mapping.controller, reflector).map((route) => ({
    controller: mapping.controller.name,
    handler: route.handler,
    requirement: route.requirement,
    expected: mapping.routes?.[route.handler] ?? mapping.default,
  })),
);

describe('BFF booking routes — tenant access mapping (M25-S18a)', () => {
  it.each(MAPPING)('finds the routes of $controller.name', ({ controller, minRoutes }) => {
    expect(routeAccessRequirements(controller, reflector).length).toBeGreaterThanOrEqual(minRoutes);
  });

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

  it('maps every per-route override to a real handler', () => {
    for (const mapping of MAPPING.filter((entry) => entry.routes)) {
      const handlers = routeAccessRequirements(mapping.controller, reflector).map(
        (route) => route.handler,
      );
      expect(handlers).toEqual(expect.arrayContaining(Object.keys(mapping.routes ?? {})));
    }
  });

  it('keeps the booking detail read DEFAULT_DENY, declared on the route itself (UC-121)', () => {
    const getOne = routeAccessRequirements(BookingsController, reflector).find(
      (route) => route.handler === 'getOne',
    );

    expect(getOne?.requirement.policy).toBe('DEFAULT_DENY');
  });

  it('keeps the booking list and the cancel the only routes a suspended tenant reaches', () => {
    const reachable = rows.filter(
      (row) =>
        row.requirement.policy !== 'DEFAULT_DENY' && row.requirement.policy !== 'PUBLIC_NONE',
    );

    expect(reachable.map((row) => `${row.controller}.${row.handler}`).sort()).toEqual([
      'BookingsController.cancel',
      'BookingsController.list',
    ]);
  });
});
