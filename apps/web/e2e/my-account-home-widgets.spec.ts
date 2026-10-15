import { expect, test } from '@playwright/test';
import { loginAsStaff } from './helpers/auth';
import { MANAGER_EMAIL, TENANT_SLUG } from './helpers/booking-form';
import {
  createAlertViaApi,
  newLoggedInCustomerPage,
  seedAlertEligibleService,
} from './helpers/availability-alert';
import {
  createRecurringScheduleViaApi,
  NEW_SCHEDULE_PATH,
  seedRecurrenceEligibleService,
} from './helpers/recurring-schedule';

// M23-S41 — the customer Início summarises the account: Pontos and Agendamentos link to their
// pages, "Recorrências" and "Avisos" tiles appear only above zero, and a "Renovar" card shows for
// a running recurring reservation inside the renewal window. Each customer here is fresh, and the
// schedules and alerts are created for them through the API.

const ACCOUNT = `/${TENANT_SLUG}/my-account`;
const RECURRING_LIST = `${ACCOUNT}/recurring-schedules`;
// Ends five days from now: inside the default 7-day renewal window the server flags `renewable` by.
const ENDING_SOON = { startsInDays: 2, termDays: 3 } as const;

test.describe('customer my-account: Início tiles and "Renovar" card (M23-S41, UC-070, UC-072)', () => {
  test('shows both tiles and the card, and each one opens its page', async ({ page, browser }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const recurringService = await seedRecurrenceEligibleService(page);
    const alertService = await seedAlertEligibleService(page);
    const customer = await newLoggedInCustomerPage(browser);

    try {
      const schedule = await createRecurringScheduleViaApi(
        customer.page,
        recurringService.serviceId,
        ENDING_SOON,
      );
      expect(schedule.status).toBe('ACTIVE');
      await createAlertViaApi(customer.page, alertService.serviceId, 0);

      await customer.page.goto(ACCOUNT);
      await expect(customer.page.getByTestId('home-recurring-value')).toContainText('1');
      await expect(customer.page.getByTestId('home-alerts-value')).toContainText('1');
      await expect(customer.page.getByTestId('home-renewal-title')).toContainText(
        recurringService.name,
      );

      await customer.page.getByTestId('home-recurring-value').click();
      await expect(customer.page).toHaveURL(RECURRING_LIST);

      await customer.page.goto(ACCOUNT);
      await customer.page.getByTestId('home-alerts-value').click();
      await expect(customer.page).toHaveURL(`${ACCOUNT}/alerts`);
    } finally {
      await customer.close();
    }
  });

  test('the card’s "Renovar" opens the renewal form pre-filled from that schedule, and the list row offers it too', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedRecurrenceEligibleService(page);
    const customer = await newLoggedInCustomerPage(browser);

    try {
      const schedule = await createRecurringScheduleViaApi(
        customer.page,
        service.serviceId,
        ENDING_SOON,
      );

      await customer.page.goto(RECURRING_LIST);
      const active = customer.page.getByTestId('section-active');
      await expect(active.getByTestId('renew-schedule-action')).toHaveCount(1);

      await customer.page.goto(ACCOUNT);
      await customer.page.getByTestId('home-renewal-action').click();

      await expect(customer.page).toHaveURL(`${NEW_SCHEDULE_PATH}?renewFrom=${schedule.id}`);
      await expect(customer.page.getByTestId('new-schedule-renewal-banner')).toContainText(
        `Renovando sua reserva de ${service.name}`,
      );
    } finally {
      await customer.close();
    }
  });

  test('a schedule far from its end gets a tile but no card, and no "Renovar" on its row', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedRecurrenceEligibleService(page);
    const customer = await newLoggedInCustomerPage(browser);

    try {
      // The default shape ends 32 days out — outside the 7-day window.
      await createRecurringScheduleViaApi(customer.page, service.serviceId);

      await customer.page.goto(ACCOUNT);
      await expect(customer.page.getByTestId('home-recurring-value')).toBeVisible();
      await expect(customer.page.getByTestId('home-renewal-card')).toHaveCount(0);

      await customer.page.goto(RECURRING_LIST);
      await expect(customer.page.getByTestId('recurring-schedule-row')).toHaveCount(1);
      await expect(customer.page.getByTestId('renew-schedule-action')).toHaveCount(0);
    } finally {
      await customer.close();
    }
  });

  test('a customer with no schedules and no alerts sees no extra tile and no card, and Pontos and Agendamentos link on', async ({
    browser,
  }) => {
    const customer = await newLoggedInCustomerPage(browser);

    try {
      await customer.page.goto(ACCOUNT);
      await expect(customer.page.getByTestId('home-points-value')).toBeVisible();
      await expect(customer.page.getByTestId('home-recurring-value')).toHaveCount(0);
      await expect(customer.page.getByTestId('home-alerts-value')).toHaveCount(0);
      await expect(customer.page.getByTestId('home-renewal-card')).toHaveCount(0);

      await customer.page.getByTestId('home-bookings-value').click();
      await expect(customer.page).toHaveURL(`${ACCOUNT}/bookings`);

      await customer.page.goto(ACCOUNT);
      await customer.page.getByTestId('home-points-value').click();
      await expect(customer.page).toHaveURL(`${ACCOUNT}/loyalty`);
    } finally {
      await customer.close();
    }
  });
});
