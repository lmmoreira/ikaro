import { expect, test, type Browser, type Page } from '@playwright/test';
import { loginAsCustomer, loginAsStaff, uniqueTestEmail } from './helpers/auth';
import { deactivateResource } from './helpers/booking';
import { completeCustomerProfile } from './helpers/customer';
import {
  bookAsGuest,
  confirmBooking,
  fillGuestContact,
  firstSlotOnDate,
  MANAGER_EMAIL,
  nextButton,
  openBooking,
  pickFirstSlot,
  seedSingleRoomService,
  selectService,
  serviceCard,
  TENANT_SLUG,
} from './helpers/booking-form';
import {
  createScheduleClosureAt,
  removeScheduleClosure,
} from './helpers/schedule/schedule-helpers';
import { deactivateService } from './helpers/services';

// M23-S11a — where a submit error returns the customer to, the per-time service card and the
// booking-details box. Real conflicts are seeded where the stack can produce them; the rest
// answer the booking POST with the wire code (the pattern guest-booking.spec.ts already uses).

async function newGuestPage(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
  });
  return { page: await context.newPage(), close: () => context.close() };
}

function problemRoute(status: number, code: string) {
  return {
    status,
    contentType: 'application/problem+json',
    body: JSON.stringify({ type: 'about:blank', title: code, status, code, detail: code }),
  };
}

// Walks to the confirmation step and returns the day whose first slot the guest took.
async function reachConfirmation(guest: Page, serviceId: string): Promise<string> {
  await openBooking(guest);
  await selectService(guest, serviceId);
  await nextButton(guest).click();
  const date = await pickFirstSlot(guest);
  await nextButton(guest).click();
  await fillGuestContact(guest);
  await nextButton(guest).click();
  return date;
}

test.describe('M23-S11a — submit routing and details', () => {
  test('a seeded slot conflict returns to availability with the catalogue message and the selections kept', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const { service, room } = await seedSingleRoomService(page, 'e2e-conflict');
    const guest = await newGuestPage(browser);

    try {
      const date = await reachConfirmation(guest.page, service.serviceId);
      const slot = await firstSlotOnDate(page, service.serviceId, date);
      expect(
        await bookAsGuest(page, { serviceIds: [service.serviceId], scheduledAt: slot.startsAt }),
      ).toBe(201);
      await confirmBooking(guest.page);

      await expect(guest.page.getByTestId('step2-error')).toContainText(
        'O horário solicitado não está mais disponível.',
      );
      await guest.page.getByRole('button', { name: 'Voltar' }).click();
      await expect(serviceCard(guest.page, service.serviceId).getByRole('checkbox')).toBeChecked();
    } finally {
      await guest.close();
      await deactivateService(page, service.serviceId);
      await deactivateResource(page, room.id);
    }
  });

  test('a closure added while the page is open returns to availability with the closed message and the selections kept', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const { service, room } = await seedSingleRoomService(page, 'e2e-closed');
    const guest = await newGuestPage(browser);
    let closureId: string | undefined;

    try {
      const date = await reachConfirmation(guest.page, service.serviceId);
      closureId = (
        await createScheduleClosureAt(page, date, { reason: 'MAINTENANCE', resourceId: room.id })
      ).id;
      await confirmBooking(guest.page);

      await expect(guest.page.getByTestId('step2-error')).toContainText(
        'O negócio está fechado no horário solicitado.',
      );
      await guest.page.getByRole('button', { name: 'Voltar' }).click();
      await expect(serviceCard(guest.page, service.serviceId).getByRole('checkbox')).toBeChecked();
    } finally {
      await guest.close();
      if (closureId) await removeScheduleClosure(page, closureId);
      await deactivateService(page, service.serviceId);
      await deactivateResource(page, room.id);
    }
  });

  test('a mocked 401 on the authenticated submit sends the customer to the hotsite login', async ({
    page,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const { service, room } = await seedSingleRoomService(page, 'e2e-401');

    try {
      await loginAsCustomer(page, uniqueTestEmail('e2e-401'), TENANT_SLUG);
      await completeCustomerProfile(page, TENANT_SLUG);
      await page.route('**/v1/bookings/authenticated', (route) =>
        route.fulfill(problemRoute(401, 'AUTH_UNAUTHORIZED')),
      );
      await openBooking(page);
      await selectService(page, service.serviceId);
      await nextButton(page).click();
      await pickFirstSlot(page);
      await nextButton(page).click();
      await nextButton(page).click();
      await confirmBooking(page);

      await expect(page).toHaveURL(new RegExp(`/${TENANT_SLUG}/login\\?returnTo=`));
    } finally {
      await page.unroute('**/v1/bookings/authenticated');
      await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
      await deactivateService(page, service.serviceId);
      await deactivateResource(page, room.id);
    }
  });
});
