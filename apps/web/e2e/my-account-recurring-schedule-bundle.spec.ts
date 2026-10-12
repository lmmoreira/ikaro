import { expect, test, type Page } from '@playwright/test';
import { loginAsStaff } from './helpers/auth';
import { MANAGER_EMAIL, TENANT_SLUG } from './helpers/booking-form';
import {
  seedFixedService,
  seedJourney,
  seedVariableDurationService,
} from './helpers/booking-form/seeds';
import { seedChoiceService, seedResource } from './helpers/booking-form/flow';
import { newLoggedInCustomerPage } from './helpers/availability-alert';
import {
  approveScheduleViaApi,
  createRecurringScheduleViaApi,
  createThroughForm,
  desktopPane,
  endScheduleViaApi,
  enableRecurrence,
  fillRecurringForm,
  listMySchedules,
  NEW_SCHEDULE_PATH,
  seedDefaultShapeRecurringService,
  seedRecurrenceEligibleService,
  seedRecurringBundle,
  submitRecurringForm,
  tenantDate,
} from './helpers/recurring-schedule';
import { createService, setBookingPolicy, setResourceRequirements } from './helpers/services';

// TD49 Story 2 — UC-070: the customer's form offers a service with several resource requirements
// (a bundle), asks for a pick on every customer-chosen one, and the backend holds all of them. Each
// test seeds its own staff, room and service as the manager and acts as a fresh customer.

const LIST_URL = `/${TENANT_SLUG}/my-account/recurring-schedules`;
const WEEKDAYS = ['tuesday'] as const;

// Releases everything a customer created, so a held room or location never outlives the test.
async function endAllSchedules(page: Page): Promise<void> {
  for (const schedule of await listMySchedules(page)) {
    if (schedule.status === 'ACTIVE') await endScheduleViaApi(page, schedule.id);
  }
}

test.describe('customer my-account: recurring reservation of a bundle (TD49-S02, UC-070)', () => {
  test('creates a schedule for a staff + room bundle, picking the staff member, and finds it on the list', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const bundle = await seedRecurringBundle(page);
    const customer = await newLoggedInCustomerPage(browser);

    try {
      await customer.page.goto(NEW_SCHEDULE_PATH);
      await createThroughForm(
        customer.page,
        {
          service: bundle.service,
          weekdays: WEEKDAYS,
          startsOn: tenantDate(5),
          endsOn: tenantDate(19),
          picks: [bundle.staffs[1]!.id],
        },
        'new-schedule-created',
      );
      await expect(customer.page.getByTestId('new-schedule-created')).toContainText(
        'Recorrência criada',
      );

      await customer.page.goto(LIST_URL);
      const active = customer.page.getByTestId('section-active');
      await expect(active.getByTestId('recurring-schedule-row')).toHaveCount(1);
      await expect(active).toContainText(bundle.service.name);
    } finally {
      await endAllSchedules(customer.page);
      await customer.close();
    }
  });

  test('the review lists the picked staff member and says the room is chosen automatically', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const bundle = await seedRecurringBundle(page);
    const customer = await newLoggedInCustomerPage(browser);

    try {
      await customer.page.goto(NEW_SCHEDULE_PATH);
      await fillRecurringForm(customer.page, {
        service: bundle.service,
        weekdays: WEEKDAYS,
        startTime: '11:00',
        startsOn: tenantDate(5),
        endsOn: tenantDate(19),
        picks: [bundle.staffs[1]!.id],
      });
      await desktopPane(customer.page).getByTestId('new-schedule-review').click();

      // Rows follow the service's requirement order, which the server does not promise: read
      // the review as a whole.
      const review = customer.page.getByTestId('new-schedule-review');
      await expect(review).toContainText(bundle.staffs[1]!.name);
      await expect(review).toContainText('Escolhida automaticamente');
    } finally {
      await customer.close();
    }
  });

  test('a conflict on the room alone lists the colliding dates and creates nothing', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const bundle = await seedRecurringBundle(page);
    const holder = await newLoggedInCustomerPage(browser);
    const customer = await newLoggedInCustomerPage(browser);

    try {
      // The holder takes the bundle's only room with the second staff member.
      await createRecurringScheduleViaApi(holder.page, bundle.service.serviceId, {
        resourceSelections: [{ resourceType: 'STAFF', resourceId: bundle.staffs[1]!.id }],
      });
      const [held] = await listMySchedules(holder.page);
      const startTime = held!.recurrence.startTime;

      // The customer asks for the free staff member at the same time: only the room collides.
      await customer.page.goto(NEW_SCHEDULE_PATH);
      await fillRecurringForm(customer.page, {
        service: bundle.service,
        weekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        startTime,
        startsOn: tenantDate(5),
        endsOn: tenantDate(8),
        picks: [bundle.staffs[0]!.id],
      });
      await submitRecurringForm(customer.page);

      const conflict = customer.page.getByTestId('new-schedule-conflict');
      await expect(conflict).toBeVisible();
      await expect(conflict.getByTestId('conflict-item').first()).toHaveAttribute(
        'data-reason',
        'OCCUPIED',
      );
      expect(await listMySchedules(customer.page)).toHaveLength(0);
    } finally {
      await endAllSchedules(holder.page);
      await holder.close();
      await customer.close();
    }
  });

  test('a bundle that needs approval is pending, and active once the manager approves it', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const bundle = await seedRecurringBundle(page, { approvalMode: 'MANUAL_APPROVAL' });
    const customer = await newLoggedInCustomerPage(browser);

    try {
      await customer.page.goto(NEW_SCHEDULE_PATH);
      await createThroughForm(
        customer.page,
        {
          service: bundle.service,
          weekdays: WEEKDAYS,
          startsOn: tenantDate(5),
          endsOn: tenantDate(19),
          picks: [bundle.staffs[0]!.id],
        },
        'recurring-schedule-pending',
      );
      await expect(customer.page.getByTestId('recurring-schedule-pending')).toContainText(
        'Estamos analisando seu pedido de recorrência',
      );

      await customer.page.goto(LIST_URL);
      await expect(
        customer.page.getByTestId('section-pending').getByTestId('recurring-schedule-row'),
      ).toHaveCount(1);

      const [pending] = await listMySchedules(customer.page);
      await approveScheduleViaApi(page, pending!.id);

      await customer.page.goto(LIST_URL);
      await expect(
        customer.page.getByTestId('section-active').getByTestId('recurring-schedule-row'),
      ).toHaveCount(1);
    } finally {
      await endAllSchedules(customer.page);
      await customer.close();
    }
  });

  test('a tenant with a default-shape service and a bundle offers both, and each is created through its own path', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const plain = await seedDefaultShapeRecurringService(page, 'NO_REQUIREMENT');
    const bundle = await seedRecurringBundle(page);
    const customer = await newLoggedInCustomerPage(browser);

    try {
      await customer.page.goto(NEW_SCHEDULE_PATH);
      await customer.page.getByTestId('new-schedule-service').click();
      await expect(customer.page.getByRole('option', { name: plain.name })).toBeVisible();
      await expect(customer.page.getByRole('option', { name: bundle.service.name })).toBeVisible();
      await customer.page.keyboard.press('Escape');

      await createThroughForm(
        customer.page,
        { service: plain, weekdays: WEEKDAYS, startsOn: tenantDate(5), endsOn: tenantDate(19) },
        'new-schedule-created',
      );
      await customer.page.goto(NEW_SCHEDULE_PATH);
      await createThroughForm(
        customer.page,
        {
          service: bundle.service,
          weekdays: ['thursday'],
          startsOn: tenantDate(5),
          endsOn: tenantDate(19),
          picks: [bundle.staffs[0]!.id],
        },
        'new-schedule-created',
      );

      await customer.page.goto(LIST_URL);
      await expect(
        customer.page.getByTestId('section-active').getByTestId('recurring-schedule-row'),
      ).toHaveCount(2);
    } finally {
      await endAllSchedules(customer.page);
      await customer.close();
    }
  });

  test('the form offers exactly the eligible services of a mixed catalog', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    // Eligible: a chosen resource, an automatic one, a unit pool, and a bundle.
    const pool = await seedRecurrenceEligibleService(page);
    const chosen = await seedChoiceService(page, 2, 'ROOM');
    await enableRecurrence(page, chosen.serviceId);
    const automatic = await seedFixedService(page, 'e2e-recorrencia-automatico');
    const automaticRoom = await seedResource(page, 'ROOM');
    await setResourceRequirements(page, automatic.serviceId, [
      { type: 'ROOM', selectionMode: 'AUTO_ANY', resourcePoolIds: [automaticRoom.id] },
    ]);
    await enableRecurrence(page, automatic.serviceId);
    const bundle = await seedRecurringBundle(page);
    // Not eligible: a service that needs a pickup address, one with recurrence off, a legged
    // journey and a customer-chosen duration, each with recurrence otherwise enabled.
    const pickup = await createService(page, {
      name: `e2e-recorrencia-coleta-${Date.now()}`,
      priceAmount: 80,
      durationMinutes: 30,
      loyaltyPointsValue: 10,
      requiresPickupAddress: true,
      isActive: true,
    });
    await setBookingPolicy(page, pickup.serviceId, {
      recurrenceEligible: true,
      defaultApprovalMode: 'AUTO_CONFIRM',
    });
    const recurrenceOff = await seedJourney(page, 'e2e-recorrencia-desligada');
    const journey = await seedJourney(page, 'e2e-recorrencia-etapas');
    await enableRecurrence(page, journey.service.serviceId);
    const variable = await seedVariableDurationService(page, 'e2e-recorrencia-duracao');
    await enableRecurrence(page, variable.service.serviceId);
    const customer = await newLoggedInCustomerPage(browser);

    try {
      await customer.page.goto(NEW_SCHEDULE_PATH);
      await customer.page.getByTestId('new-schedule-service').click();

      for (const offered of [pool.name, chosen.name, automatic.name, bundle.service.name]) {
        await expect(customer.page.getByRole('option', { name: offered })).toBeVisible();
      }
      for (const hidden of [
        pickup.name,
        recurrenceOff.service.name,
        journey.service.name,
        variable.service.name,
      ]) {
        await expect(customer.page.getByRole('option', { name: hidden })).toHaveCount(0);
      }
    } finally {
      await customer.close();
    }
  });
});
