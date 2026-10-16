import { expect, test, type Page } from '@playwright/test';
import { loginAsStaff } from './helpers/auth';
import { deactivateResource } from './helpers/booking';
import {
  chooseNewContact,
  chooseRegisteredCustomer,
  chooseServiceInSteps,
  createStaffBookingOnFirstFreeSlot,
  heldResourceIds,
  openNewBookingMenu,
  seedCustomerForStaffBooking,
  seedPlainService,
  seedStaffAndRoomChoiceService,
  STAFF_TENANT_SLUG,
  startNewBooking,
  staffStepNext,
} from './helpers/booking/staff-new-booking';
import {
  MANAGER_EMAIL,
  openFirstDayWithSlots,
  seedChoiceService,
  seedJourney,
  stepIndicator,
} from './helpers/booking-form';
import { deactivateService } from './helpers/services';

// M23-S40 — UC-108: staff book on a customer's behalf from the Agenda's "+ Novo" menu. The manager
// seeds a service of its own (so other specs' services never decide what the steps look like) and
// the same session books through the real UI, BFF and backend.

async function openCreatedBooking(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Ver agendamento' }).click();
  await expect(page.getByTestId('booking-detail-page')).toBeVisible();
  // Created already APPROVED: the triage actions are gone and the lifecycle ones are there.
  await expect(page.getByRole('button', { name: 'Aprovar' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Marcar não compareceu' })).toBeVisible();
}

test.describe('staff new booking (UC-108)', () => {
  test('the "+ Novo" menu offers Agendamento and Recorrência', async ({ page }) => {
    await loginAsStaff(page, MANAGER_EMAIL, STAFF_TENANT_SLUG);

    await openNewBookingMenu(page);

    await expect(page.getByTestId('new-menu-item')).toHaveCount(2);
    await expect(page.getByTestId('new-menu-item').first()).toContainText('Agendamento');
    await expect(page.getByTestId('new-menu-item').nth(1)).toContainText('Recorrência');
  });

  test('staff pick a registered customer, book a free slot and see the booking approved', async ({
    page,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, STAFF_TENANT_SLUG);
    const service = await seedPlainService(page);
    const customerEmail = await seedCustomerForStaffBooking(page);
    await loginAsStaff(page, MANAGER_EMAIL, STAFF_TENANT_SLUG);

    try {
      await startNewBooking(page);
      await chooseRegisteredCustomer(page, customerEmail);
      await chooseServiceInSteps(page, service.serviceId);
      await createStaffBookingOnFirstFreeSlot(page);

      await expect(page.getByTestId('outcome-banner-title')).toHaveText('Agendamento criado');
      await openCreatedBooking(page);
      await expect(page.getByTestId('booking-detail-page')).toContainText(customerEmail);
    } finally {
      await deactivateService(page, service.serviceId);
    }
  });

  test('staff book someone who is not registered from a typed contact', async ({ page }) => {
    await loginAsStaff(page, MANAGER_EMAIL, STAFF_TENANT_SLUG);
    const service = await seedPlainService(page);
    const guestEmail = `convidado-${Date.now()}@e2e.example.com`;

    try {
      await startNewBooking(page);
      await chooseNewContact(page, {
        name: 'Convidada Telefone',
        phone: '31988887777',
        email: guestEmail,
      });
      await chooseServiceInSteps(page, service.serviceId);
      await createStaffBookingOnFirstFreeSlot(page);

      await expect(page.getByTestId('outcome-banner-title')).toHaveText('Agendamento criado');
      await openCreatedBooking(page);
      await expect(page.getByTestId('booking-detail-page')).toContainText('Convidada Telefone');
    } finally {
      await deactivateService(page, service.serviceId);
    }
  });

  test('a service with a resource to choose adds a picker step', async ({ page }) => {
    await loginAsStaff(page, MANAGER_EMAIL, STAFF_TENANT_SLUG);
    const seeded = await seedChoiceService(page);
    const customerEmail = await seedCustomerForStaffBooking(page);
    await loginAsStaff(page, MANAGER_EMAIL, STAFF_TENANT_SLUG);

    try {
      await startNewBooking(page);
      await chooseRegisteredCustomer(page, customerEmail);
      await chooseServiceInSteps(page, seeded.serviceId);

      await expect(page.getByTestId('step-resource-picker')).toBeVisible();
      await expect(stepIndicator(page, 2, 4)).toBeVisible();
      await expect(page.getByTestId('picker-option')).toHaveCount(2);
      await expect(staffStepNext(page)).toBeDisabled();

      await page.locator(`[data-resource-id="${seeded.resourceIds[0]}"]`).click();
      await staffStepNext(page).click();
      const booking = await createStaffBookingOnFirstFreeSlot(page);

      await expect(page.getByTestId('outcome-banner-title')).toHaveText('Agendamento criado');
      expect(await heldResourceIds(page, booking)).toEqual([seeded.resourceIds[0]]);
    } finally {
      await deactivateService(page, seeded.serviceId);
      for (const id of seeded.resourceIds) await deactivateResource(page, id);
    }
  });

  test('a service asking for a staff member and a room shows both choices on one step', async ({
    page,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, STAFF_TENANT_SLUG);
    const seeded = await seedStaffAndRoomChoiceService(page);
    const customerEmail = await seedCustomerForStaffBooking(page);
    await loginAsStaff(page, MANAGER_EMAIL, STAFF_TENANT_SLUG);

    try {
      await startNewBooking(page);
      await chooseRegisteredCustomer(page, customerEmail);
      await chooseServiceInSteps(page, seeded.serviceId);

      await expect(stepIndicator(page, 2, 4)).toBeVisible();
      await expect(page.getByTestId('picker-section')).toHaveCount(2);
      await expect(
        page.locator('[data-testid="picker-section"][data-resource-type="STAFF"]'),
      ).toHaveCount(1);
      await expect(
        page.locator('[data-testid="picker-section"][data-resource-type="ROOM"]'),
      ).toHaveCount(1);

      // Both are required: one pick alone does not let staff go on.
      await page.locator(`[data-resource-id="${seeded.staffIds[0]}"]`).click();
      await expect(staffStepNext(page)).toBeDisabled();
      await page.locator(`[data-resource-id="${seeded.roomIds[0]}"]`).click();
      await staffStepNext(page).click();
      const booking = await createStaffBookingOnFirstFreeSlot(page);

      await expect(page.getByTestId('outcome-banner-title')).toHaveText('Agendamento criado');
      const held = await heldResourceIds(page, booking);
      expect(held).toEqual(expect.arrayContaining([seeded.staffIds[0], seeded.roomIds[0]]));
      expect(held).not.toContain(seeded.staffIds[1]);
      expect(held).not.toContain(seeded.roomIds[1]);
    } finally {
      await deactivateService(page, seeded.serviceId);
      for (const id of [...seeded.staffIds, ...seeded.roomIds]) await deactivateResource(page, id);
    }
  });

  test('a journey of legs asks for the choices leg by leg, then books the whole itinerary', async ({
    page,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, STAFF_TENANT_SLUG);
    const journey = await seedJourney(page);
    const customerEmail = await seedCustomerForStaffBooking(page);
    await loginAsStaff(page, MANAGER_EMAIL, STAFF_TENANT_SLUG);

    try {
      await startNewBooking(page);
      await chooseRegisteredCustomer(page, customerEmail);
      await chooseServiceInSteps(page, journey.service.serviceId);

      // Services, the Massagem staff pick, the Relaxamento equipment pick, date and confirmation.
      await expect(stepIndicator(page, 2, 5)).toBeVisible();
      await expect(page.getByTestId('picker-heading')).toContainText('Massagem');
      await expect(staffStepNext(page)).toBeDisabled();
      await page.locator(`[data-resource-id="${journey.staffs[0]!.id}"]`).click();
      await staffStepNext(page).click();

      await expect(stepIndicator(page, 3, 5)).toBeVisible();
      await expect(page.getByTestId('picker-heading')).toContainText('Relaxamento');
      await page.locator(`[data-resource-id="${journey.equipments[0]!.id}"]`).click();
      await staffStepNext(page).click();

      const booking = await createStaffBookingOnFirstFreeSlot(page);

      await expect(page.getByTestId('outcome-banner-title')).toHaveText('Agendamento criado');
      const held = await heldResourceIds(page, booking);
      expect(held).toEqual(
        expect.arrayContaining([journey.staffs[0]!.id, journey.equipments[0]!.id]),
      );
      expect(held).not.toContain(journey.staffs[1]!.id);
      expect(held).not.toContain(journey.equipments[1]!.id);
    } finally {
      await deactivateService(page, journey.service.serviceId);
      for (const id of journey.resourceIds) await deactivateResource(page, id);
    }
  });

  test('a customer with no phone gets the no-phone outcome and a way to pick someone else', async ({
    page,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, STAFF_TENANT_SLUG);
    const service = await seedPlainService(page);
    const customerEmail = await seedCustomerForStaffBooking(page, { withPhone: false });
    await loginAsStaff(page, MANAGER_EMAIL, STAFF_TENANT_SLUG);

    try {
      await startNewBooking(page);
      await chooseRegisteredCustomer(page, customerEmail);
      await chooseServiceInSteps(page, service.serviceId);
      await openFirstDayWithSlots(page);
      await page.getByTestId('time-slot').first().click();
      await staffStepNext(page).click();
      await staffStepNext(page).click();

      await expect(page.getByTestId('outcome-banner-title')).toContainText(
        'não tem telefone cadastrado',
      );
      await expect(page.getByRole('link', { name: 'Escolher outro cliente' })).toHaveAttribute(
        'href',
        '/dashboard/bookings/new',
      );
    } finally {
      await deactivateService(page, service.serviceId);
    }
  });
});
