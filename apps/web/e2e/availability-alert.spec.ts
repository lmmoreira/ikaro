import { expect, test } from '@playwright/test';
import { loginAsCustomer, loginAsStaff, uniqueTestEmail } from './helpers/auth';
import {
  createAlertViaApi,
  fillAlertRange,
  futureDate,
  listMyAlerts,
  newContextPage,
  newLoggedInCustomerPage,
  openCalendarStep,
  seedAlertEligibleService,
} from './helpers/availability-alert';
import { completeCustomerProfile } from './helpers/customer';
import {
  MANAGER_EMAIL,
  nextButton,
  openBooking,
  seedChoiceService,
  seedFixedService,
  selectService,
  TENANT_SLUG,
} from './helpers/booking-form';
import { seedBundle, seedVariableDurationService } from './helpers/booking-form/seeds';
import { setBookingPolicy } from './helpers/services';

// M23-S31 — UC-072: the calendar step offers "Avise-me quando abrir", which opens the alert page
// of the booking flow. A logged-in customer fills the criteria and saves; a guest meets a login
// card and returns to the same prefilled page. An ineligible service offers nothing.

const ALERT_PAGE = `/${TENANT_SLUG}/booking/availability-alert`;

test.describe('M23-S31 — availability alert entry', () => {
  test('a customer creates a one-time-range alert from the calendar step and sees the confirmation', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedAlertEligibleService(page);
    const customer = await newLoggedInCustomerPage(browser);

    try {
      await openCalendarStep(customer.page, service.serviceId);
      await customer.page.getByTestId('availability-alert-entry').click();

      await expect(customer.page).toHaveURL(
        new RegExp(`${ALERT_PAGE}\\?serviceId=${service.serviceId}`),
      );
      await expect(customer.page.getByTestId('availability-alert-form')).toBeVisible();
      await expect(customer.page.getByTestId('alert-service')).toContainText(service.name);

      await fillAlertRange(customer.page, futureDate(2), futureDate(9));
      await customer.page.getByTestId('alert-submit').click();

      await expect(customer.page.getByTestId('availability-alert-saved')).toBeVisible({
        timeout: 20_000,
      });
      await expect(customer.page.getByTestId('availability-alert-back-to-site')).toHaveAttribute(
        'href',
        `/${TENANT_SLUG}`,
      );

      const saved = (await listMyAlerts(customer.page)).filter(
        (alert) => alert.serviceId === service.serviceId,
      );
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({ criteriaType: 'ONE_TIME_RANGE', status: 'ACTIVE' });
    } finally {
      await customer.close();
    }
  });

  test('a customer creates a weekly-preference alert', async ({ page, browser }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedAlertEligibleService(page);
    const customer = await newLoggedInCustomerPage(browser);

    try {
      await customer.page.goto(`${ALERT_PAGE}?serviceId=${service.serviceId}`);
      await expect(customer.page.getByTestId('availability-alert-form')).toBeVisible();

      await customer.page.getByTestId('criteria-weekly').check();
      await customer.page.locator('[data-testid="alert-weekday"][data-day="tuesday"]').click();
      await customer.page.locator('[data-testid="alert-weekday"][data-day="thursday"]').click();
      await customer.page.getByTestId('alert-submit').click();

      await expect(customer.page.getByTestId('availability-alert-saved')).toBeVisible({
        timeout: 20_000,
      });
      const saved = (await listMyAlerts(customer.page)).filter(
        (alert) => alert.serviceId === service.serviceId,
      );
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({
        criteriaType: 'WEEKLY_PREFERENCE',
        weekdays: ['tuesday', 'thursday'],
        localStartTime: '09:00',
        localEndTime: '12:00',
      });
    } finally {
      await customer.close();
    }
  });

  test('a guest who clicks the button meets the login card, signs in, lands on the same prefilled page and saves', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedAlertEligibleService(page);
    const guest = await newContextPage(browser);

    try {
      await openCalendarStep(guest.page, service.serviceId);
      await guest.page.getByTestId('availability-alert-entry').click();

      await expect(guest.page.getByTestId('availability-alert-login-gate')).toBeVisible({
        timeout: 20_000,
      });
      await expect(guest.page.getByTestId('availability-alert-form')).toHaveCount(0);

      // The real round-trip goes through Google; the card's link must carry this very page — with
      // its query string — as the return target.
      const cta = guest.page.getByTestId('availability-alert-login-cta');
      const href = (await cta.getAttribute('href')) ?? '';
      const returnTo = new URL(href, 'http://x').searchParams.get('returnTo');
      expect(returnTo).toBe(`${ALERT_PAGE}?serviceId=${service.serviceId}`);

      await loginAsCustomer(guest.page, uniqueTestEmail('e2e-alert-guest'), TENANT_SLUG);
      await completeCustomerProfile(guest.page, TENANT_SLUG);
      await guest.page.goto(returnTo ?? ALERT_PAGE);

      await expect(guest.page.getByTestId('availability-alert-form')).toBeVisible();
      await expect(guest.page.getByTestId('alert-service')).toContainText(service.name);
      await fillAlertRange(guest.page, futureDate(2), futureDate(9));
      await guest.page.getByTestId('alert-submit').click();

      await expect(guest.page.getByTestId('availability-alert-saved')).toBeVisible({
        timeout: 20_000,
      });
    } finally {
      await guest.close();
    }
  });

  test('a service that does not permit alerts offers no button, and a hand-typed link shows the not-eligible state', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedFixedService(page, 'e2e-sem-aviso');
    const customer = await newLoggedInCustomerPage(browser);

    try {
      await openCalendarStep(customer.page, service.serviceId);
      await expect(customer.page.getByTestId('step-next')).toBeVisible();
      await expect(customer.page.getByTestId('availability-alert-entry')).toHaveCount(0);

      await customer.page.goto(`${ALERT_PAGE}?serviceId=${service.serviceId}`);
      await expect(customer.page.getByTestId('availability-alert-ineligible')).toBeVisible({
        timeout: 20_000,
      });
    } finally {
      await customer.close();
    }
  });

  test('a customer who already holds 10 active alerts is told so and pointed to "Meus avisos"', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedAlertEligibleService(page);
    const customer = await newLoggedInCustomerPage(browser);

    try {
      for (let index = 0; index < 10; index += 1) {
        await createAlertViaApi(customer.page, service.serviceId, index);
      }

      await customer.page.goto(`${ALERT_PAGE}?serviceId=${service.serviceId}`);
      await fillAlertRange(customer.page, futureDate(2), futureDate(9));
      await customer.page.getByTestId('alert-submit').click();

      await expect(customer.page.getByTestId('availability-alert-cap-reached')).toBeVisible({
        timeout: 20_000,
      });
      await expect(customer.page.getByTestId('availability-alert-view-alerts')).toHaveAttribute(
        'href',
        `/${TENANT_SLUG}/my-account/alerts`,
      );
    } finally {
      await customer.close();
    }
  });

  test('a resource picked in the booking flow is shown read-only and saved as the preferred resource', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const service = await seedChoiceService(page);
    await setBookingPolicy(page, service.serviceId, { availabilityAlertEligible: true });
    const pickedResourceId = service.resourceIds[0];
    const customer = await newLoggedInCustomerPage(browser);

    try {
      await customer.page.goto(
        `${ALERT_PAGE}?serviceId=${service.serviceId}&preferredResourceId=${pickedResourceId}`,
      );
      await expect(customer.page.getByTestId('availability-alert-form')).toBeVisible();
      await expect(customer.page.getByTestId('alert-resource')).toBeVisible({ timeout: 20_000 });
      await expect(customer.page.getByTestId('alert-composite-note')).toHaveCount(0);

      await fillAlertRange(customer.page, futureDate(2), futureDate(9));
      await customer.page.getByTestId('alert-submit').click();

      await expect(customer.page.getByTestId('availability-alert-saved')).toBeVisible({
        timeout: 20_000,
      });
      const saved = (await listMyAlerts(customer.page)).filter(
        (alert) => alert.serviceId === service.serviceId,
      );
      expect(saved).toHaveLength(1);
      expect(saved[0]?.preferredResourceId).toBe(pickedResourceId);
    } finally {
      await customer.close();
    }
  });

  test('the duration chosen for a customer-selected service is carried to the alert and saved', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const { service } = await seedVariableDurationService(page);
    await setBookingPolicy(page, service.serviceId, { availabilityAlertEligible: true });
    const customer = await newLoggedInCustomerPage(browser);

    try {
      await customer.page.goto(`${ALERT_PAGE}?serviceId=${service.serviceId}&durationMinutes=120`);
      await expect(customer.page.getByTestId('availability-alert-form')).toBeVisible();

      await fillAlertRange(customer.page, futureDate(2), futureDate(9));
      await customer.page.getByTestId('alert-submit').click();

      await expect(customer.page.getByTestId('availability-alert-saved')).toBeVisible({
        timeout: 20_000,
      });
      const saved = (await listMyAlerts(customer.page)).filter(
        (alert) => alert.serviceId === service.serviceId,
      );
      expect(saved).toHaveLength(1);
      expect(saved[0]?.durationMinutes).toBe(120);
    } finally {
      await customer.close();
    }
  });

  test('a bundle shows the composite note, offers no resource and saves without a preferred resource', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const { service } = await seedBundle(page);
    await setBookingPolicy(page, service.serviceId, { availabilityAlertEligible: true });
    const customer = await newLoggedInCustomerPage(browser);

    try {
      await customer.page.goto(`${ALERT_PAGE}?serviceId=${service.serviceId}`);
      await expect(customer.page.getByTestId('availability-alert-form')).toBeVisible();
      await expect(customer.page.getByTestId('alert-composite-note')).toBeVisible();
      await expect(customer.page.getByTestId('alert-resource')).toHaveCount(0);

      await fillAlertRange(customer.page, futureDate(2), futureDate(9));
      await customer.page.getByTestId('alert-submit').click();

      await expect(customer.page.getByTestId('availability-alert-saved')).toBeVisible({
        timeout: 20_000,
      });
      const saved = (await listMyAlerts(customer.page)).filter(
        (alert) => alert.serviceId === service.serviceId,
      );
      expect(saved).toHaveLength(1);
      expect(saved[0]?.preferredResourceId).toBeNull();
    } finally {
      await customer.close();
    }
  });

  test('a basket with two services offers no alert button', async ({ page, browser }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const first = await seedAlertEligibleService(page);
    const second = await seedAlertEligibleService(page);
    const customer = await newLoggedInCustomerPage(browser);

    try {
      await openBooking(customer.page);
      await selectService(customer.page, first.serviceId);
      await selectService(customer.page, second.serviceId);
      await nextButton(customer.page).click();

      await expect(customer.page.locator('[data-testid="day-option"]').first()).toBeVisible({
        timeout: 20_000,
      });
      await expect(customer.page.getByTestId('availability-alert-entry')).toHaveCount(0);
    } finally {
      await customer.close();
    }
  });
});
