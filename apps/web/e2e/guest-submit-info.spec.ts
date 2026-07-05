import { test, expect } from '@playwright/test';
import { createGuestInfoRequestedBooking, mintGuestToken } from './helpers/booking';

const STAFF_EMAIL = 'admin@lavacar.com.br';

test.describe('UC-005 A2 — Guest submit-info golden path', () => {
  test('guest opens the tokenised link, submits a response, and sees the success screen', async ({
    page,
  }) => {
    const { bookingId, contactEmail } = await createGuestInfoRequestedBooking(
      page,
      STAFF_EMAIL,
      'Por favor, envie fotos do veículo antes da lavagem.',
    );
    const token = mintGuestToken({ bookingId, contactEmail });

    await page.goto(`/bookings/${bookingId}/submit-info?token=${token}`);

    await expect(page.getByLabel(/Sua resposta/)).toBeVisible();
    await page.getByLabel(/Sua resposta/).fill('Segue a foto do veículo conforme solicitado.');
    await page.getByRole('button', { name: 'Enviar resposta' }).click();

    await expect(page.getByTestId('submit-info-success')).toBeVisible();
  });
});

test.describe('UC-005 A2 — Guest submit-info invalid link', () => {
  test('renders the invalid-link screen when no token is present', async ({ page }) => {
    await page.goto('/bookings/00000000-0000-4000-8000-000000000001/submit-info');

    await expect(page.getByTestId('invalid-link-view')).toBeVisible();
  });

  test('does not render the hotsite for the /bookings/ static segment', async ({ page }) => {
    await page.goto('/bookings/00000000-0000-4000-8000-000000000001/submit-info?token=invalid');

    await expect(page.getByTestId('invalid-link-view')).toBeVisible();
    await expect(page.locator('#service-list')).not.toBeVisible();
  });
});
