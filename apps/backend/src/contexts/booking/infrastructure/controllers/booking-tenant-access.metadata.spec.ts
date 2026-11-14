import type { Type } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SUSPENSION_ACCESS_KEY, routeAccessRequirements } from '@ikaro/nestjs-http';
import type { SuspensionAccessPolicy } from '@ikaro/types';
import type { FeatureKey } from '@ikaro/validation';
import { BookingAttachmentsController } from './booking-attachments.controller';
import { BookingCompletionController } from './booking-completion.controller';
import { BookingLifecycleController } from './booking-lifecycle.controller';
import { BookingController } from './booking.controller';

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

// M25-S18a: the backend booking and lifecycle route → feature / suspension-policy mapping, pinned.
// The detector proves a declaration exists; only this proves it is the right one. A route added
// later is covered by its controller's default, or fails here until it is mapped.
const MAPPING: ControllerMapping[] = [
  { controller: BookingAttachmentsController, default: DENY, minRoutes: 1 },
  {
    controller: BookingCompletionController,
    default: DENY,
    // UC-121: a suspended tenant's customer can still cancel a future booking.
    routes: { cancelAsCustomer: HISTORY },
    minRoutes: 7,
  },
  {
    controller: BookingLifecycleController,
    default: DENY,
    routes: { submitInfoGuest: PUBLIC },
    minRoutes: 5,
  },
  {
    controller: BookingController,
    default: DENY,
    // The booking list is the customer's history; creating a booking as a guest is public. The
    // detail read (`getOne`) stays DEFAULT_DENY: UC-121 blocks opening a booking's detail.
    routes: { list: HISTORY, create: PUBLIC },
    minRoutes: 5,
  },
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

describe('Booking routes — tenant access mapping (M25-S18a)', () => {
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
    const getOne = routeAccessRequirements(BookingController, reflector).find(
      (route) => route.handler === 'getOne',
    );

    expect(getOne?.requirement.policy).toBe('DEFAULT_DENY');
    // The effective policy alone would pass on the class default; the route must carry its own.
    expect(reflector.get(SUSPENSION_ACCESS_KEY, BookingController.prototype.getOne)).toBe(
      'DEFAULT_DENY',
    );
  });

  it('keeps the booking list and the customer cancel the only routes a suspended tenant reaches', () => {
    const reachable = rows.filter(
      (row) =>
        row.requirement.policy !== 'DEFAULT_DENY' && row.requirement.policy !== 'PUBLIC_NONE',
    );

    expect(reachable.map((row) => `${row.controller}.${row.handler}`).sort()).toEqual([
      'BookingCompletionController.cancelAsCustomer',
      'BookingController.list',
    ]);
  });
});
