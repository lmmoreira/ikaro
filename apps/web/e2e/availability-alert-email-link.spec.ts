import { expect, test, type Page } from '@playwright/test';
import { loginAsStaff } from './helpers/auth';
import { newContextPage, seedAlertEligibleService } from './helpers/availability-alert';
import {
  findFirstSlot,
  MANAGER_EMAIL,
  nextButton,
  serviceCard,
  TENANT_SLUG,
} from './helpers/booking-form';

// M23-S44 — UC-072: the "a slot opened up" email links to /{slug}/booking with the alert's service
// and the day the slot opened. The booking page opens on that service, with the day selected on
// the calendar step; a link it cannot honour shows the plain booking flow.

const BOOKING_PAGE = `/${TENANT_SLUG}/booking`;
const UNKNOWN_SERVICE_ID = '00000000-0000-4000-8000-0000000000ff';

async function seedServiceWithADayOfSlots(page: Page) {
  await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
  const service = await seedAlertEligibleService(page);
  const { date } = await findFirstSlot(page, service.serviceId);
  return { service, date };
}

test.describe('M23-S44 — availability-alert email link', () => {
  test('the link opens the booking page on the alert’s service and day', async ({
    page,
    browser,
  }) => {
    const { service, date } = await seedServiceWithADayOfSlots(page);
    const guest = await newContextPage(browser);

    try {
      await guest.page.goto(`${BOOKING_PAGE}?serviceId=${service.serviceId}&date=${date}`);

      await expect(guest.page.getByTestId('step-service-selection')).toBeVisible();
      await expect(serviceCard(guest.page, service.serviceId).getByRole('checkbox')).toBeChecked();

      await nextButton(guest.page).click();

      await expect(
        guest.page.locator(`[data-testid="day-option"][data-date="${date}"]`),
      ).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 });
      await expect(guest.page.getByTestId('time-slot').first()).toBeVisible();
    } finally {
      await guest.close();
    }
  });

  test('a link the page cannot honour shows the plain booking flow, with no error', async ({
    browser,
  }) => {
    const guest = await newContextPage(browser);

    try {
      for (const query of [
        `serviceId=${UNKNOWN_SERVICE_ID}&date=2099-01-01`,
        'serviceId=not-a-uuid&date=not-a-date',
        'date=2030-01-01',
      ]) {
        await guest.page.goto(`${BOOKING_PAGE}?${query}`);

        await expect(guest.page.getByTestId('step-service-selection')).toBeVisible();
        await expect(guest.page.getByRole('checkbox', { checked: true })).toHaveCount(0);
        await expect(guest.page.getByTestId('step1-form-error')).toHaveCount(0);
      }
    } finally {
      await guest.close();
    }
  });

  test('a day that has filled up since the email shows the no-slots message and a usable calendar', async ({
    page,
    browser,
  }) => {
    const { service, date } = await seedServiceWithADayOfSlots(page);
    const guest = await newContextPage(browser);

    try {
      await guest.page.route(/\/v1\/schedule\/availability\?/, (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ date, available: false, slots: [] }),
        }),
      );
      await guest.page.goto(`${BOOKING_PAGE}?serviceId=${service.serviceId}&date=${date}`);
      await nextButton(guest.page).click();

      await expect(guest.page.getByTestId('slot-picker-empty')).toBeVisible({
        timeout: 20_000,
      });
      await expect(guest.page.getByTestId('time-slot')).toHaveCount(0);
      await expect(guest.page.locator('[data-testid="day-option"]').first()).toBeVisible();
    } finally {
      await guest.close();
    }
  });
});
