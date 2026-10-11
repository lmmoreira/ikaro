import { expect, test } from '@playwright/test';
import { loginAsStaff } from './helpers/auth';
import { MANAGER_EMAIL, TENANT_SLUG } from './helpers/booking-form';
import { newLoggedInCustomerPage } from './helpers/availability-alert';
import { createAuthenticatedBooking } from './helpers/booking/create-booking';
import {
  createThroughForm,
  endScheduleViaApi,
  listMySchedules,
  NEW_SCHEDULE_PATH,
  seedBundleServiceWithRecurrenceOn,
  seedDefaultShapeRecurringService,
  tenantDate,
  type DefaultServiceShape,
} from './helpers/recurring-schedule';

// TD49-S03 — UC-070: a service of the default shape (no resource requirement, or the stored
// unrestricted location) recurs against the tenant's single LOCATION, and the form offers exactly
// the services the backend accepts. The shared tenant always has other eligible services, so the
// empty states are covered by the page's unit specs, not here.

const LIST_URL = `/${TENANT_SLUG}/my-account/recurring-schedules`;
const WEEKDAYS = ['tuesday'] as const;
const SHAPES: readonly { readonly label: string; readonly shape: DefaultServiceShape }[] = [
  { label: 'a service with no resource requirement', shape: 'NO_REQUIREMENT' },
  { label: 'an older service with the stored NONE location row', shape: 'STORED_LOCATION' },
];

test.describe('customer my-account: recurring reservation of a default-shape service (TD49-S03, UC-070)', () => {
  for (const { label, shape } of SHAPES) {
    test(`creates a schedule for ${label} and finds it on the list`, async ({ page, browser }) => {
      await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
      const service = await seedDefaultShapeRecurringService(page, shape);
      const customer = await newLoggedInCustomerPage(browser);

      try {
        await customer.page.goto(NEW_SCHEDULE_PATH);
        await createThroughForm(
          customer.page,
          { service, weekdays: WEEKDAYS, startsOn: tenantDate(5), endsOn: tenantDate(19) },
          'new-schedule-created',
        );
        await expect(customer.page.getByTestId('new-schedule-created')).toContainText(
          'Recorrência criada',
        );

        await customer.page.goto(LIST_URL);
        const active = customer.page.getByTestId('section-active');
        await expect(active.getByTestId('recurring-schedule-row')).toHaveCount(1);
        await expect(active).toContainText(service.name);
      } finally {
        // Release the location this test held, pass or fail, so later one-off bookings of default
        // services are not blocked by a leftover weekly hold. The customer is new for this test, so
        // every schedule it owns was created here.
        for (const schedule of await listMySchedules(customer.page)) {
          await endScheduleViaApi(customer.page, schedule.id);
        }
        await customer.close();
      }
    });
  }

  test('the form offers a default-shape service but not a service that has recurrence on and needs staff plus a room', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const offered = await seedDefaultShapeRecurringService(page, 'NO_REQUIREMENT');
    const bundle = await seedBundleServiceWithRecurrenceOn(page);
    const customer = await newLoggedInCustomerPage(browser);

    try {
      await customer.page.goto(NEW_SCHEDULE_PATH);
      await customer.page.getByTestId('new-schedule-service').click();

      // A string name matches as a substring, so a name with regex characters stays literal.
      await expect(customer.page.getByRole('option', { name: offered.name })).toBeVisible();
      await expect(customer.page.getByRole('option', { name: bundle.name })).toHaveCount(0);
    } finally {
      await customer.close();
    }
  });

  // Closes M23-S17's partial E2E criterion ("with and without bookings"): the empty tab is covered
  // in my-account-recurring-schedule-create.spec.ts.
  test('on a phone-sized screen the in-page "+ Novo" menu is also present once the customer has bookings', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await createAuthenticatedBooking(page, {
        tenantSlug: TENANT_SLUG,
        emailPrefix: 'e2e-menu-bookings',
        daysAhead: 9,
      });
      await page.setViewportSize({ width: 390, height: 800 });
      await page.goto(`/${TENANT_SLUG}/my-account/bookings`);

      await expect(page.getByTestId('booking-status-badge').first()).toBeVisible();
      await expect(page.getByTestId('mobile-new-menu')).toBeVisible();
      await page.locator('[data-testid="new-menu-trigger"]:visible').click();
      await page.getByTestId('new-menu-recurring').click();
      await expect(page).toHaveURL(NEW_SCHEDULE_PATH);
    } finally {
      await context.close();
    }
  });
});
