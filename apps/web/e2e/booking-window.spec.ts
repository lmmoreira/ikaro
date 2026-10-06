import { expect, test, type Page } from '@playwright/test';
import { loginAsStaff } from './helpers/auth';
import {
  MANAGER_EMAIL,
  nextButton,
  openBooking,
  selectService,
  TENANT_SLUG,
} from './helpers/booking-form';
import { createService, makeUniqueServiceName, setBookingPolicy } from './helpers/services';

// M23-S33 — the public booking page offers exactly the window the backend enforces: a service's
// own maximum narrows the day strip, and its minimum notice disables the days that can no longer
// hold a bookable slot.

async function seedServiceWithWindow(
  page: Page,
  window: { minBookingAdvanceHoursOverride?: number; maxBookingAdvanceDaysOverride?: number },
): Promise<string> {
  const service = await createService(page, {
    name: makeUniqueServiceName('e2e-janela'),
    priceAmount: 40,
    durationMinutes: 30,
    loyaltyPointsValue: 5,
  });
  await setBookingPolicy(page, service.serviceId, window);
  return service.serviceId;
}

async function reachAvailability(guest: Page, serviceId: string): Promise<void> {
  await openBooking(guest);
  await selectService(guest, serviceId);
  await nextButton(guest).click();
  await expect(guest.getByTestId('day-option').first()).toBeVisible({ timeout: 20_000 });
}

test.describe('M23-S33 — booking window on the public page', () => {
  test("a service's own maximum limits the day strip to that many days", async ({ page }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const serviceId = await seedServiceWithWindow(page, { maxBookingAdvanceDaysOverride: 3 });

    await reachAvailability(page, serviceId);

    await expect(page.getByTestId('day-option')).toHaveCount(3);
  });

  test("a service's minimum notice disables the days before the first one it leaves", async ({
    page,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    // 72 hours: today and the next two days can no longer hold a slot.
    const serviceId = await seedServiceWithWindow(page, { minBookingAdvanceHoursOverride: 72 });

    await reachAvailability(page, serviceId);

    const days = page.getByTestId('day-option');
    for (const index of [0, 1, 2]) {
      await expect(days.nth(index)).toBeDisabled();
    }
  });
});
