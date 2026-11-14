import type { Type } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { routeAccessRequirements } from '@ikaro/nestjs-http';
import type { SuspensionAccessPolicy } from '@ikaro/types';
import type { FeatureKey } from '@ikaro/validation';
import { AvailabilityAlertsController } from './availability-alerts.controller';
import { RecurringBookingSchedulesController } from './recurring-booking-schedules.controller';
import { ResourceController } from './resource.controller';
import { ScheduleAvailabilitySummaryController } from './schedule-availability-summary.controller';
import { ScheduleAvailabilityController } from './schedule-availability.controller';
import { ScheduleDayGridController } from './schedule-day-grid.controller';
import { ScheduleOpeningController } from './schedule-opening.controller';
import { ScheduleController } from './schedule.controller';
import { SchedulingExceptionsController } from './scheduling-exceptions.controller';
import { ServicesPublicController } from './services.public.controller';
import { ServicesController } from './services.controller';

interface Declared {
  feature: FeatureKey;
  policy: SuspensionAccessPolicy;
}

interface ControllerMapping {
  controller: Type<unknown>;
  declared: Declared;
  /** Fewer routes than this means the controller lost handlers (or the reader lost them). */
  minRoutes: number;
}

const DENY: Declared = { feature: 'BOOKING', policy: 'DEFAULT_DENY' };
const PUBLIC: Declared = { feature: 'BOOKING', policy: 'PUBLIC_NONE' };

// M25-S18b: the BFF route → feature / suspension-policy mapping of the Booking operations half
// (services, resources, schedule, recurring schedules, alerts, the worklist), pinned. The detector
// proves a declaration exists; only this proves it is the right one. Every controller declares one
// policy for all of its routes, so a route added later is covered by its controller's entry, or
// fails here until the controller is mapped. A suspended tenant reaches none of them.
const MAPPING: ControllerMapping[] = [
  { controller: ServicesController, declared: DENY, minRoutes: 13 },
  { controller: ResourceController, declared: DENY, minRoutes: 7 },
  { controller: RecurringBookingSchedulesController, declared: DENY, minRoutes: 6 },
  { controller: AvailabilityAlertsController, declared: DENY, minRoutes: 5 },
  { controller: SchedulingExceptionsController, declared: DENY, minRoutes: 5 },
  { controller: ScheduleController, declared: DENY, minRoutes: 3 },
  { controller: ScheduleOpeningController, declared: DENY, minRoutes: 3 },
  { controller: ScheduleDayGridController, declared: DENY, minRoutes: 1 },
  // The public controllers: each route carries its tenant in `X-Tenant-Slug`, which the BFF guard
  // resolves, so the declaration is enforced here and not only documented.
  { controller: ServicesPublicController, declared: PUBLIC, minRoutes: 5 },
  { controller: ScheduleAvailabilityController, declared: PUBLIC, minRoutes: 1 },
  { controller: ScheduleAvailabilitySummaryController, declared: PUBLIC, minRoutes: 1 },
];

const reflector = new Reflector();

const rows = MAPPING.flatMap((mapping) =>
  routeAccessRequirements(mapping.controller, reflector).map((route) => ({
    controller: mapping.controller.name,
    handler: route.handler,
    requirement: route.requirement,
    expected: mapping.declared,
  })),
);

describe('BFF booking operations routes — tenant access mapping (M25-S18b)', () => {
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

  it('maps the 50 routes of the operations half', () => {
    expect(rows).toHaveLength(50);
  });

  it('keeps every operations route out of a suspended tenant reach', () => {
    const reachable = rows.filter(
      (row) =>
        row.requirement.policy !== 'DEFAULT_DENY' && row.requirement.policy !== 'PUBLIC_NONE',
    );

    expect(reachable).toEqual([]);
  });

  it('marks only the public controllers PUBLIC_NONE', () => {
    const publicControllers = new Set(
      rows.filter((row) => row.requirement.policy === 'PUBLIC_NONE').map((row) => row.controller),
    );

    expect([...publicControllers].sort()).toEqual([
      'ScheduleAvailabilityController',
      'ScheduleAvailabilitySummaryController',
      'ServicesPublicController',
    ]);
  });
});
