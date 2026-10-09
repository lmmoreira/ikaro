import { expect, test } from '@playwright/test';
import { loginAsStaff } from './helpers/auth';
import { MANAGER_EMAIL, TENANT_SLUG } from './helpers/booking-form';
import { newLoggedInCustomerPage } from './helpers/availability-alert';
import {
  createRecurringScheduleViaApi,
  seedRecurrenceEligibleService,
} from './helpers/recurring-schedule';

// M23-S12 — UC-070 A2: "Minha Conta" lists a customer's recurring reservations, opens one, pages
// through its upcoming bookings (5 to a page) so any future occurrence can be skipped, and ends the
// recurrence from a confirmation page. Every schedule here is created for a fresh customer through
// the API; the occurrences are real bookings (M23-S08).

const LIST_URL = `/${TENANT_SLUG}/my-account/recurring-schedules`;

test.describe('customer my-account: recurring reservations (M23-S12, UC-070)', () => {
  test('lists a schedule under "Ativas", opens it, and shows five upcoming bookings with a pager', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedRecurrenceEligibleService(page);
    const customer = await newLoggedInCustomerPage(browser);

    try {
      const schedule = await createRecurringScheduleViaApi(customer.page, service.serviceId);
      expect(schedule.status).toBe('ACTIVE');

      await customer.page.goto(LIST_URL);
      const active = customer.page.getByTestId('section-active');
      await expect(active.getByTestId('recurring-schedule-row')).toHaveCount(1);
      await expect(active).toContainText(service.name);

      await active.getByRole('link', { name: service.name }).click();
      await expect(customer.page).toHaveURL(`${LIST_URL}/${schedule.id}`);
      await expect(customer.page.getByTestId('recurring-occurrence')).toHaveCount(5);
      await expect(customer.page.getByTestId('occurrence-pager')).toBeVisible();
      await expect(customer.page.getByTestId('pager-previous')).toHaveJSProperty('tagName', 'SPAN');
    } finally {
      await customer.close();
    }
  });

  test('paging reaches a later page, and skipping an occurrence there returns to that same page', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedRecurrenceEligibleService(page);
    const customer = await newLoggedInCustomerPage(browser);

    try {
      const schedule = await createRecurringScheduleViaApi(customer.page, service.serviceId);
      const detailUrl = `${LIST_URL}/${schedule.id}`;

      await customer.page.goto(detailUrl);
      await customer.page.getByTestId('pager-next').click();
      await expect(customer.page).toHaveURL(`${detailUrl}?page=2`);
      await expect(customer.page.getByTestId('recurring-occurrence')).toHaveCount(5);

      await customer.page.getByTestId('occurrence-skip').first().click();
      await expect(customer.page).toHaveURL(new RegExp(`/bookings/[^/]+/cancel\\?returnTo=`));

      await customer.page
        .getByTestId('action-pane-desktop')
        .getByRole('button', { name: 'Confirmar cancelamento' })
        .click();

      // Back on the schedule's page 2, not on the account home.
      await expect(customer.page).toHaveURL(`${detailUrl}?page=2`);
      await expect(customer.page.getByTestId('recurring-occurrence')).toHaveCount(5);
    } finally {
      await customer.close();
    }
  });

  test('ending a schedule moves it to "Encerradas" and opens read-only', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedRecurrenceEligibleService(page);
    const customer = await newLoggedInCustomerPage(browser);

    try {
      const schedule = await createRecurringScheduleViaApi(customer.page, service.serviceId);

      await customer.page.goto(`${LIST_URL}/${schedule.id}`);
      await customer.page
        .getByTestId('action-pane-desktop')
        .getByTestId('end-schedule-link')
        .click();
      await expect(customer.page).toHaveURL(`${LIST_URL}/${schedule.id}/end`);

      await customer.page.getByTestId('end-schedule-confirm').first().click();
      await expect(customer.page).toHaveURL(LIST_URL);

      const ended = customer.page.getByTestId('section-ended');
      await expect(ended.getByTestId('recurring-schedule-row')).toHaveCount(1);
      await expect(ended.getByTestId('recurring-schedule-status-badge')).toContainText('Cancelada');
      await expect(customer.page.getByTestId('section-active')).toHaveCount(0);

      await ended.getByRole('link', { name: service.name }).click();
      await expect(customer.page.getByTestId('recurring-schedule-detail')).toBeVisible();
      await expect(customer.page.getByTestId('end-schedule-link')).toHaveCount(0);
      await expect(customer.page.getByTestId('occurrence-skip')).toHaveCount(0);
      await expect(customer.page.getByTestId('occurrence-reschedule')).toHaveCount(0);

      // The end page only serves a running schedule — anything else goes back to the read-only page.
      await customer.page.goto(`${LIST_URL}/${schedule.id}/end`);
      await expect(customer.page).toHaveURL(`${LIST_URL}/${schedule.id}`);
    } finally {
      await customer.close();
    }
  });

  test('a customer with no schedule sees the empty state and no entry row on Agendamentos', async ({
    browser,
  }) => {
    const customer = await newLoggedInCustomerPage(browser);

    try {
      await customer.page.goto(LIST_URL);
      await expect(customer.page.getByTestId('recurring-schedules-empty')).toBeVisible();
      await expect(customer.page.getByTestId('recurring-schedule-row')).toHaveCount(0);

      await customer.page.goto(`/${TENANT_SLUG}/my-account/bookings`);
      await expect(customer.page.getByTestId('recurring-entry-row')).toHaveCount(0);
    } finally {
      await customer.close();
    }
  });

  test('Agendamentos shows the "Reservas recorrentes" row with the active count once a schedule exists', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedRecurrenceEligibleService(page);
    const customer = await newLoggedInCustomerPage(browser);

    try {
      await createRecurringScheduleViaApi(customer.page, service.serviceId);

      await customer.page.goto(`/${TENANT_SLUG}/my-account/bookings`);
      const entry = customer.page.getByTestId('recurring-entry-row');
      await expect(entry).toBeVisible();
      await expect(customer.page.getByTestId('recurring-entry-count')).toContainText('1');

      await entry.click();
      await expect(customer.page).toHaveURL(LIST_URL);
    } finally {
      await customer.close();
    }
  });
});
