import type { Type } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { routeAccessRequirements } from '@ikaro/nestjs-http';
import { InternalBillingAccessController } from '../../contexts/billing/infrastructure/controllers/internal-billing-access.controller';
import { InternalBillingOperatorController } from '../../contexts/billing/infrastructure/controllers/internal-billing-operator.controller';
import { InternalBillingRegistrationController } from '../../contexts/billing/infrastructure/controllers/internal-billing-registration.controller';
import { InternalDevClockController } from '../../contexts/billing/infrastructure/controllers/internal-dev-clock.controller';
import { CronBookingController } from '../../contexts/booking/infrastructure/controllers/cron-booking.controller';
import { InternalCustomerController } from '../../contexts/customer/infrastructure/controllers/internal-customer.controller';
import { CronLoyaltyController } from '../../contexts/loyalty/infrastructure/controllers/cron-loyalty.controller';
import { CronChatbotController } from '../../contexts/platform/infrastructure/controllers/cron-chatbot.controller';
import { CronLeadFormController } from '../../contexts/platform/infrastructure/controllers/cron-lead-form.controller';
import { InternalSignupController } from '../../contexts/platform/infrastructure/controllers/internal-signup.controller';
import { InternalTenantReadController } from '../../contexts/platform/infrastructure/controllers/internal-tenant-read.controller';
import { InternalTenantController } from '../../contexts/platform/infrastructure/controllers/internal-tenant.controller';
import { InternalStaffController } from '../../contexts/staff/infrastructure/controllers/internal-staff.controller';
import { HealthController } from '../../health/health.controller';
import { PubSubPushController } from '../infrastructure/event-bus/pubsub-push.controller';
import { OutboxRelayController } from '../infrastructure/outbox/outbox-relay.controller';

interface ControllerMapping {
  controller: Type<unknown>;
  /** Fewer routes than this means the controller lost handlers (or the reader lost them). */
  minRoutes: number;
}

// M25-S20: the backend surface no sellable feature owns (`/internal/*`, `/cron/*`, `/pubsub/*`,
// the outbox relay and `health`). Every route is `@NoFeatureGate()` and `ANY_AUTHENTICATED`: the
// BFF forwards the caller's `X-Tenant-ID` and `X-Actor-Role` together on its authenticated
// internal calls, and the machine routes carry no tenant at all. The detector proves a declaration
// exists; only this proves it is the right one.
const MAPPING: ControllerMapping[] = [
  { controller: InternalBillingAccessController, minRoutes: 2 },
  { controller: InternalBillingOperatorController, minRoutes: 5 },
  { controller: InternalBillingRegistrationController, minRoutes: 3 },
  { controller: InternalDevClockController, minRoutes: 3 },
  { controller: InternalSignupController, minRoutes: 2 },
  { controller: InternalTenantController, minRoutes: 1 },
  { controller: InternalTenantReadController, minRoutes: 4 },
  { controller: InternalCustomerController, minRoutes: 2 },
  { controller: InternalStaffController, minRoutes: 3 },
  { controller: CronBookingController, minRoutes: 2 },
  { controller: CronLoyaltyController, minRoutes: 2 },
  { controller: CronChatbotController, minRoutes: 2 },
  { controller: CronLeadFormController, minRoutes: 1 },
  { controller: OutboxRelayController, minRoutes: 1 },
  { controller: PubSubPushController, minRoutes: 1 },
  { controller: HealthController, minRoutes: 2 },
];

const reflector = new Reflector();

const rows = MAPPING.flatMap(({ controller }) =>
  routeAccessRequirements(controller, reflector).map((route) => ({
    controller: controller.name,
    handler: route.handler,
    requirement: route.requirement,
  })),
);

describe('Cross-cutting backend routes — tenant access mapping (M25-S20)', () => {
  it.each(MAPPING)('finds the routes of $controller.name', ({ controller, minRoutes }) => {
    expect(routeAccessRequirements(controller, reflector).length).toBeGreaterThanOrEqual(minRoutes);
  });

  it.each(rows)(
    '$controller.$handler is NoFeatureGate and ANY_AUTHENTICATED',
    ({ requirement }) => {
      expect(requirement).toEqual({
        feature: undefined,
        noFeatureGate: true,
        policy: 'ANY_AUTHENTICATED',
      });
    },
  );

  it('maps the 36 routes of the sixteen controllers', () => {
    expect(rows).toHaveLength(36);
  });

  it('keeps the suspended-tenant-ids read explicit on its own handler', () => {
    const requirement = rows.find(
      (row) =>
        row.controller === 'InternalBillingAccessController' &&
        row.handler === 'listSuspendedTenantIds',
    )?.requirement;

    expect(requirement).toEqual({ noFeatureGate: true, policy: 'ANY_AUTHENTICATED' });
  });
});
