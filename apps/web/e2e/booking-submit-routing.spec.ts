import AxeBuilder from '@axe-core/playwright';
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
  seedChoiceService,
  seedResource,
  selectService,
  serviceCard,
  stepIndicator,
  TENANT_SLUG,
} from './helpers/booking-form';
import {
  createService,
  deactivateService,
  makeUniqueServiceName,
  setBookingPolicy,
  setResourceRequirements,
} from './helpers/services';

// M23-S11a — where a submit error returns the customer to, the per-time service card and the
// booking-details box. Real conflicts are seeded where the stack can produce them; the rest
// answer the booking POST with the wire code (the pattern guest-booking.spec.ts already uses).

async function newGuestPage(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
  });
  return { page: await context.newPage(), close: () => context.close() };
}

async function seedSingleRoomService(page: Page, prefix: string) {
  const room = await seedResource(page, 'ROOM');
  const service = await createService(page, {
    name: makeUniqueServiceName(prefix),
    priceAmount: 150,
    durationMinutes: 60,
    loyaltyPointsValue: 10,
  });
  await setResourceRequirements(page, service.serviceId, [
    { type: 'ROOM', selectionMode: 'AUTO_FUNGIBLE_POOL', resourcePoolIds: [room.id] },
  ]);
  return { service, room };
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

  test('a mocked inactive-service rejection returns to Step 1 with its message', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const { service, room } = await seedSingleRoomService(page, 'e2e-inactive');
    const guest = await newGuestPage(browser);
    await guest.page.route('**/v1/bookings', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill(problemRoute(422, 'BOOKING_SERVICE_NOT_ACTIVE'))
        : route.continue(),
    );

    try {
      await reachConfirmation(guest.page, service.serviceId);
      await confirmBooking(guest.page);

      await expect(guest.page.getByTestId('step1-submit-error')).toContainText(
        'Este serviço não está ativo no momento.',
      );
      await expect(guest.page.getByTestId('step-service-selection')).toBeVisible();
    } finally {
      await guest.close();
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

  test('a per-time service shows its rate and duration range and "a partir de" in the total', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const { service, room } = await seedSingleRoomService(page, 'e2e-por-tempo');
    await setBookingPolicy(page, service.serviceId, {
      durationPolicy: 'CUSTOMER_SELECTED',
      durationMinMinutes: 60,
      durationMaxMinutes: 480,
      durationIncrementMinutes: 60,
      pricingPolicy: 'PER_TIME_INCREMENT',
      pricingIncrementMinutes: 60,
      pricePerIncrementAmount: 50,
      minimumChargeAmount: null,
    });
    const guest = await newGuestPage(browser);

    try {
      await openBooking(guest.page);
      const card = serviceCard(guest.page, service.serviceId);
      await expect(card.getByTestId('service-rate')).toHaveText('R$ 50,00 / hora');
      await expect(card.getByTestId('service-duration-range')).toHaveText('1h a 8h');

      await selectService(guest.page, service.serviceId);
      await expect(guest.page.getByTestId('selection-total')).toContainText('a partir de R$ 50,00');
    } finally {
      await guest.close();
      await deactivateService(page, service.serviceId);
      await deactivateResource(page, room.id);
    }
  });

  test('the booking-details box lists the service, date/time and total between the message and the back link', async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const { service, room } = await seedSingleRoomService(page, 'e2e-detalhes');
    const guest = await newGuestPage(browser);

    try {
      await reachConfirmation(guest.page, service.serviceId);
      await confirmBooking(guest.page);

      await expect(guest.page.getByTestId('booking-success')).toBeVisible();
      const details = guest.page.getByTestId('booking-submitted-details');
      await expect(details).toContainText(service.name);
      await expect(details).toContainText('R$ 150,00');
      await expect(guest.page.getByTestId('submitted-datetime')).toBeVisible();
      await expect(guest.page.getByTestId('submitted-total')).toContainText('Total: R$ 150,00');
      await expect(guest.page.getByRole('link', { name: 'Voltar para o site' })).toBeVisible();
    } finally {
      await guest.close();
      await deactivateService(page, service.serviceId);
      await deactivateResource(page, room.id);
    }
  });

  test('the resource picker step has no axe violations', async ({ page, browser }) => {
    await loginAsStaff(page, MANAGER_EMAIL, TENANT_SLUG);
    const seeded = await seedChoiceService(page);
    const guest = await newGuestPage(browser);

    try {
      await openBooking(guest.page);
      await selectService(guest.page, seeded.serviceId);
      await nextButton(guest.page).click();
      await expect(stepIndicator(guest.page, 2, 5)).toBeVisible();

      const results = await new AxeBuilder({ page: guest.page })
        .include('[data-testid="step-resource-picker"]')
        .analyze();
      expect(results.violations).toEqual([]);
    } finally {
      await guest.close();
      await deactivateService(page, seeded.serviceId);
      for (const id of seeded.resourceIds) await deactivateResource(page, id);
    }
  });
});
