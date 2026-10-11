import { expect, test } from '@playwright/test';
import { loginAsStaff } from './helpers/auth';
import { MANAGER_EMAIL, TENANT_SLUG } from './helpers/booking-form';
import { newLoggedInCustomerPage } from './helpers/availability-alert';
import { markScheduleEnded } from './helpers/db/e2e-db';
import {
  createRecurringScheduleViaApi,
  desktopPane,
  listMySchedules,
  NEW_SCHEDULE_PATH,
  seedRecurrenceEligibleService,
  tenantDate,
} from './helpers/recurring-schedule';

// M23-S22 — UC-070: "Renovar" on an ended recurring reservation opens the creation form pre-filled
// from it; the reminder email links to the same URL. The product marks a schedule ENDED only after
// its last day, so each spec flips a live one in the database and does everything else through the
// real BFF.

const LIST_URL = `/${TENANT_SLUG}/my-account/recurring-schedules`;
const TERM_DAYS = 27;
// The renewal starts the day after the old term ends.
const RENEWAL_STARTS_IN = 5 + TERM_DAYS + 1;

test.describe('customer my-account: renewing a recurring reservation (M23-S22, UC-070)', () => {
  test('an ended schedule offers "Renovar", which opens the form pre-filled from it', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedRecurrenceEligibleService(page);
    const customer = await newLoggedInCustomerPage(browser);

    try {
      const schedule = await createRecurringScheduleViaApi(customer.page, service.serviceId);
      await markScheduleEnded(schedule.id);

      await customer.page.goto(LIST_URL);
      const ended = customer.page.getByTestId('section-ended');
      await expect(ended.getByTestId('recurring-schedule-row')).toHaveCount(1);
      await ended.getByTestId('renew-schedule-action').click();

      await expect(customer.page).toHaveURL(`${NEW_SCHEDULE_PATH}?renewFrom=${schedule.id}`);
      await expect(customer.page.getByTestId('new-schedule-renewal-banner')).toContainText(
        `Renovando sua reserva de ${service.name}`,
      );
      await expect(customer.page.getByTestId('new-schedule-starts-on')).toContainText(
        tenantDate(RENEWAL_STARTS_IN).split('-').reverse().join('/'),
      );
      await expect(customer.page.getByTestId('new-schedule-ends-on')).toContainText(
        'Escolher data',
      );
    } finally {
      await customer.close();
    }
  });

  test('the customer picks an end date, confirms, and the renewal is a new schedule beside the old one', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedRecurrenceEligibleService(page);
    const customer = await newLoggedInCustomerPage(browser);

    try {
      const schedule = await createRecurringScheduleViaApi(customer.page, service.serviceId);
      await markScheduleEnded(schedule.id);

      await customer.page.goto(`${NEW_SCHEDULE_PATH}?renewFrom=${schedule.id}`);
      await customer.page.getByTestId('new-schedule-ends-on').click();
      const endsOn = tenantDate(RENEWAL_STARTS_IN + 13);
      const cell = customer.page.locator(`[data-day="${endsOn}"] button`);
      for (let step = 0; step < 6 && !(await cell.isVisible()); step += 1) {
        await customer.page.getByTestId('calendar-next-month').click();
      }
      await cell.click();

      await desktopPane(customer.page).getByTestId('new-schedule-review').click();
      await desktopPane(customer.page).getByTestId('new-schedule-confirm').click();

      await expect(customer.page.getByTestId('new-schedule-created')).toBeVisible();
      const schedules = await listMySchedules(customer.page);
      expect(schedules).toHaveLength(2);
      expect(schedules.find((item) => item.id === schedule.id)?.status).toBe('ENDED');
    } finally {
      await customer.close();
    }
  });

  test('a link to a schedule that does not exist opens the blank form with the notice', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    await seedRecurrenceEligibleService(page);
    const customer = await newLoggedInCustomerPage(browser);

    try {
      await customer.page.goto(
        `${NEW_SCHEDULE_PATH}?renewFrom=00000000-0000-4000-8000-00000000dead`,
      );

      await expect(customer.page.getByTestId('new-schedule-renewal-not-found')).toContainText(
        'Não encontramos a reserva que você queria renovar.',
      );
      await expect(customer.page.getByTestId('new-schedule-renewal-banner')).toHaveCount(0);
      await expect(customer.page.getByTestId('new-schedule-form')).toBeVisible();
    } finally {
      await customer.close();
    }
  });

  test('a renewal colliding with later occupancy shows the conflict list and creates nothing', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedRecurrenceEligibleService(page);
    const customer = await newLoggedInCustomerPage(browser);

    try {
      const schedule = await createRecurringScheduleViaApi(customer.page, service.serviceId);
      // The same customer already holds the same hour in the week the renewal would start, so the
      // service's single room is taken there.
      await createRecurringScheduleViaApi(customer.page, service.serviceId, {
        startsInDays: RENEWAL_STARTS_IN,
        termDays: 6,
        startTimes: [schedule.startTime],
      });
      await markScheduleEnded(schedule.id);

      await customer.page.goto(`${NEW_SCHEDULE_PATH}?renewFrom=${schedule.id}`);
      await customer.page.getByTestId('new-schedule-ends-on').click();
      const endsOn = tenantDate(RENEWAL_STARTS_IN + 13);
      const cell = customer.page.locator(`[data-day="${endsOn}"] button`);
      for (let step = 0; step < 6 && !(await cell.isVisible()); step += 1) {
        await customer.page.getByTestId('calendar-next-month').click();
      }
      await cell.click();
      await desktopPane(customer.page).getByTestId('new-schedule-review').click();
      await desktopPane(customer.page).getByTestId('new-schedule-confirm').click();

      await expect(customer.page.getByTestId('new-schedule-conflict')).toBeVisible();
      expect(await listMySchedules(customer.page)).toHaveLength(2);
    } finally {
      await customer.close();
    }
  });
});
