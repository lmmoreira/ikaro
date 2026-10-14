import { expect, test, type Page } from '@playwright/test';
import { loginAsStaff } from './helpers/auth';
import { deactivateResource } from './helpers/booking';
import {
  chooseNewContact,
  chooseRegisteredCustomer,
  chooseServiceInSteps,
  createStaffBookingOnFirstFreeSlot,
  openNewBookingMenu,
  seedCustomerForStaffBooking,
  seedPlainService,
  STAFF_TENANT_SLUG,
  startNewBooking,
  staffStepNext,
} from './helpers/booking/staff-new-booking';
import {
  MANAGER_EMAIL,
  openFirstDayWithSlots,
  seedChoiceService,
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
  test('the "+ Novo" menu offers only Agendamento until the recurrence flow ships', async ({
    page,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, STAFF_TENANT_SLUG);

    await openNewBookingMenu(page);

    await expect(page.getByTestId('new-menu-item')).toHaveCount(1);
    await expect(page.getByTestId('new-menu-item')).toContainText('Agendamento');
    await expect(page.getByTestId('new-menu')).not.toContainText('Recorrência');
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
      await createStaffBookingOnFirstFreeSlot(page);

      await expect(page.getByTestId('outcome-banner-title')).toHaveText('Agendamento criado');
    } finally {
      await deactivateService(page, seeded.serviceId);
      for (const id of seeded.resourceIds) await deactivateResource(page, id);
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
