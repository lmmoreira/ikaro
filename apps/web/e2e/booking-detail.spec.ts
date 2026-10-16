import { expect, test } from '@playwright/test';
import { loginAsCustomer, loginAsStaff, uniqueTestEmail } from './helpers/auth';
import { createFreshApprovedBooking } from './helpers/booking';

const TENANT_SLUG = 'lavacar-beloauto';
const STAFF_EMAIL = 'admin@lavacar.com.br';

const NEW_CARD_TEST_IDS = [
  'booking-resources-card',
  'booking-itinerary-card',
  'booking-participants-card',
  'booking-intake-card',
  'booking-addresses-card',
  'booking-cancellation-card',
  'booking-rejection-card',
];

test.describe('full booking detail (staff and customer)', () => {
  test('a plain booking shows the origin card and none of the resource, participant or intake cards', async ({
    page,
  }) => {
    const setup = await createFreshApprovedBooking(page, 40, STAFF_EMAIL);
    await loginAsStaff(page, STAFF_EMAIL, TENANT_SLUG);

    await page.goto(`/dashboard/bookings/${setup.bookingId}`);

    await expect(page.getByTestId('booking-origin-card')).toContainText('Solicitado em');
    for (const testId of NEW_CARD_TEST_IDS) {
      await expect(page.getByTestId(testId)).toHaveCount(0);
    }
  });

  test('a cancelled booking shows who cancelled and the way back, to staff and to the customer', async ({
    page,
    browser,
  }) => {
    const customerEmail = uniqueTestEmail('detail-cancelled');
    const setup = await createFreshApprovedBooking(page, 44, STAFF_EMAIL, {
      contactEmail: customerEmail,
    });
    await loginAsStaff(page, STAFF_EMAIL, TENANT_SLUG);

    await page.goto(`/dashboard/bookings/${setup.bookingId}`);
    await page.getByRole('button', { name: 'Cancelar agendamento' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox').fill('Equipamento em manutenção');
    await dialog.getByRole('button', { name: 'Cancelar agendamento' }).click();
    await expect(page.getByTestId('booking-cancelled-title')).toBeVisible();

    // Reloaded, the detail is the read-only terminal state: the cancellation card, no actions,
    // and the way back to the Agenda.
    await page.goto(`/dashboard/bookings/${setup.bookingId}`);
    const card = page.getByTestId('booking-cancellation-card');
    await expect(card).toContainText('Cancelado por');
    await expect(card).toContainText('Equipamento em manutenção');
    await expect(
      page.locator('main aside').getByRole('link', { name: 'Voltar à agenda' }),
    ).toBeVisible();

    const customerContext = await browser.newContext();
    const customerPage = await customerContext.newPage();
    try {
      await loginAsCustomer(customerPage, customerEmail, TENANT_SLUG);
      await customerPage.goto(`/${TENANT_SLUG}/my-account/bookings/${setup.bookingId}`);

      await expect(customerPage.getByTestId('booking-ended-notice')).toContainText(
        'Agendamento cancelado',
      );
      const customerCard = customerPage.getByTestId('booking-cancellation-card');
      await expect(customerCard).toContainText('O estabelecimento');
      await expect(customerCard).toContainText('Equipamento em manutenção');
      await expect(customerPage.getByTestId('booking-internal-notes-card')).toHaveCount(0);
      await expect(customerPage.getByTestId('booking-origin-card')).toHaveCount(0);
      await expect(
        customerPage.getByRole('link', { name: 'Fazer novo agendamento' }).first(),
      ).toBeVisible();
    } finally {
      await customerContext.close();
    }
  });
});
