import type { Type } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { routeAccessRequirements } from '@ikaro/nestjs-http';
import type { SuspensionAccessPolicy } from '@ikaro/types';
import type { FeatureKey } from '@ikaro/validation';
import { AvailabilityAlertController } from './availability-alert.controller';
import { RecurringBookingScheduleController } from './recurring-booking-schedule.controller';
import { ResourceController } from './resource.controller';
import { ScheduleAvailabilitySummaryController } from './schedule-availability-summary.controller';
import { ScheduleAvailabilityController } from './schedule-availability.controller';
import { ScheduleClosureController } from './schedule-closure.controller';
import { ScheduleDayGridController } from './schedule-day-grid.controller';
import { ScheduleOpeningController } from './schedule-opening.controller';
import { SchedulingExceptionController } from './scheduling-exception.controller';
import { ServicePublicPageController } from './service-public-page.controller';
import { ServicePublicController } from './service-public.controller';
import { ServiceController } from './service.controller';

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

// M25-S18b: the backend route → feature / suspension-policy mapping of the Booking operations half
// (services, resources, schedule, recurring schedules, alerts, the worklist), pinned. The detector
// proves a declaration exists; only this proves it is the right one. Every controller declares one
// policy for all of its routes, so a route added later is covered by its controller's entry, or
// fails here until the controller is mapped. A suspended tenant reaches none of them.
const MAPPING: ControllerMapping[] = [
  { controller: ServiceController, declared: DENY, minRoutes: 12 },
  { controller: ServicePublicPageController, declared: DENY, minRoutes: 1 },
  { controller: ResourceController, declared: DENY, minRoutes: 6 },
  { controller: RecurringBookingScheduleController, declared: DENY, minRoutes: 6 },
  { controller: AvailabilityAlertController, declared: DENY, minRoutes: 5 },
  { controller: SchedulingExceptionController, declared: DENY, minRoutes: 5 },
  { controller: ScheduleClosureController, declared: DENY, minRoutes: 3 },
  { controller: ScheduleOpeningController, declared: DENY, minRoutes: 3 },
  { controller: ScheduleDayGridController, declared: DENY, minRoutes: 1 },
  // The public controllers: the guest booking flow reads these with no actor.
  { controller: ServicePublicController, declared: PUBLIC, minRoutes: 3 },
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

describe('Booking operations routes — tenant access mapping (M25-S18b)', () => {
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

  it('maps the 47 routes of the operations half', () => {
    expect(rows).toHaveLength(47);
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
      'ServicePublicController',
    ]);
  });
});
