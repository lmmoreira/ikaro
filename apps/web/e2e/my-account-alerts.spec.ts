import { expect, test } from '@playwright/test';
import { loginAsStaff } from './helpers/auth';
import {
  createAlertViaApi,
  newLoggedInCustomerPage,
  seedAlertEligibleService,
} from './helpers/availability-alert';
import { MANAGER_EMAIL, TENANT_SLUG } from './helpers/booking-form';

// M23-S43 — UC-076: "Minha Conta" lists a customer's availability alerts, opens one, and cancels
// it from a confirmation page. The alerts are created for a fresh customer through the API (the
// booking-flow creation is covered by availability-alert.spec.ts).

const ACCOUNT = `/${TENANT_SLUG}/my-account`;
const LIST_URL = `${ACCOUNT}/alerts`;

test.describe('customer my-account: availability alerts (M23-S43, UC-076)', () => {
  test('lists a real alert under "Ativos", opens its detail, and the Agendamentos tab links to it', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedAlertEligibleService(page);
    const customer = await newLoggedInCustomerPage(browser);

    try {
      const alert = await createAlertViaApi(customer.page, service.serviceId, 0);

      await customer.page.goto(`${ACCOUNT}/bookings`);
      await customer.page.getByTestId('alerts-entry-row').click();
      await expect(customer.page).toHaveURL(LIST_URL);

      const active = customer.page.getByTestId('section-active');
      await expect(active.getByTestId('alert-row')).toHaveCount(1);
      await expect(active).toContainText(service.name);

      await active.getByRole('link', { name: service.name }).click();
      await expect(customer.page).toHaveURL(`${LIST_URL}/${alert.id}`);
      await expect(customer.page.getByTestId('alert-detail')).toContainText(service.name);
      await expect(
        customer.page.locator('[data-testid="cancel-alert-link"]:visible'),
      ).toBeVisible();
    } finally {
      await customer.close();
    }
  });

  test('cancels an alert through the confirmation page and sees it leave the list', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedAlertEligibleService(page);
    const customer = await newLoggedInCustomerPage(browser);

    try {
      const alert = await createAlertViaApi(customer.page, service.serviceId, 0);

      await customer.page.goto(`${LIST_URL}/${alert.id}`);
      await customer.page.locator('[data-testid="cancel-alert-link"]:visible').click();
      await expect(customer.page).toHaveURL(`${LIST_URL}/${alert.id}/cancel`);
      await expect(customer.page.getByTestId('alert-cancel-confirm')).toContainText(service.name);

      await customer.page.locator('[data-testid="cancel-alert-confirm"]:visible').click();

      await expect(customer.page).toHaveURL(LIST_URL);
      await expect(customer.page.getByTestId('alerts-empty')).toBeVisible();
      await expect(customer.page.getByTestId('alert-row')).toHaveCount(0);
    } finally {
      await customer.close();
    }
  });

  test('a customer with no alert sees the empty state, and Agendamentos has no "Meus avisos" row', async ({
    browser,
  }) => {
    const customer = await newLoggedInCustomerPage(browser);

    try {
      await customer.page.goto(LIST_URL);
      await expect(customer.page.getByTestId('alerts-empty')).toBeVisible();
      await expect(customer.page.getByTestId('alerts-empty-cta')).toHaveAttribute(
        'href',
        `/${TENANT_SLUG}/booking`,
      );

      await customer.page.goto(`${ACCOUNT}/bookings`);
      await expect(customer.page.getByTestId('alerts-entry-row')).toHaveCount(0);
    } finally {
      await customer.close();
    }
  });
});
