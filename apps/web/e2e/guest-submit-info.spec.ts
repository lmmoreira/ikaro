import { test, expect } from '@playwright/test';
import {
  createGuestInfoRequestedBooking,
  mintGuestToken,
  submitGuestInfoDirectly,
} from './helpers/booking';

const STAFF_EMAIL = 'admin@lavacar.com.br';
const INFO_REQUEST_MESSAGE = 'Por favor, envie fotos do veículo antes da lavagem.';

test.describe('UC-005 A2 — Guest submit-info golden path', () => {
  test('guest opens the tokenised link, submits a response, and sees the success screen', async ({
    page,
  }) => {
    const { bookingId, contactEmail } = await createGuestInfoRequestedBooking(
      page,
      STAFF_EMAIL,
      INFO_REQUEST_MESSAGE,
    );
    const token = mintGuestToken({ bookingId, contactEmail });

    await page.goto(`/bookings/${bookingId}/submit-info?token=${token}`);

    await expect(page.getByTestId('response-input')).toBeVisible();
    await page.getByTestId('response-input').fill('Segue a foto do veículo conforme solicitado.');
    await page.getByRole('button', { name: 'Enviar resposta' }).click();

    await expect(page.getByTestId('submit-info-success')).toBeVisible();
  });

  test('guest uploads a photo, submits a response, and sees the success screen', async ({
    page,
  }) => {
    const { bookingId, contactEmail } = await createGuestInfoRequestedBooking(
      page,
      STAFF_EMAIL,
      INFO_REQUEST_MESSAGE,
    );
    const token = mintGuestToken({ bookingId, contactEmail });

    await page.goto(`/bookings/${bookingId}/submit-info?token=${token}`);

    await expect(page.getByTestId('response-input')).toBeVisible();
    await page.getByTestId('photo-upload-input').setInputFiles({
      name: 'vehicle.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake-image-content-for-e2e'),
    });
    await expect(page.getByTestId('photo-upload-status')).toHaveText('Enviada');

    await page.getByTestId('response-input').fill('Segue a foto conforme solicitado.');
    await page.getByRole('button', { name: 'Enviar resposta' }).click();

    await expect(page.getByTestId('submit-info-success')).toBeVisible();
  });
});

test.describe('UC-005 A2 — Guest submit-info already processed', () => {
  test('shows the processed screen with real tenant branding when the booking is no longer INFO_REQUESTED', async ({
    page,
  }) => {
    const { bookingId, contactEmail } = await createGuestInfoRequestedBooking(
      page,
      STAFF_EMAIL,
      INFO_REQUEST_MESSAGE,
    );
    const token = mintGuestToken({ bookingId, contactEmail });
    await submitGuestInfoDirectly(page, bookingId, token, 'Resposta já enviada anteriormente.');

    await page.goto(`/bookings/${bookingId}/submit-info?token=${token}`);

    await expect(page.getByTestId('invalid-link-view')).toBeVisible();
    await expect(page.getByTestId('processed-message')).toHaveText(
      'Este agendamento já foi processado.',
    );
    // Real tenant branding still resolved (not the generic default) — same token, verified.
    await expect(page.getByTestId('brand-name')).toHaveText('BELOAUTO');
  });
});

test.describe('UC-005 A2 — Guest submit-info tampered token', () => {
  test('shows real tenant branding on the invalid-link screen even when the signature does not verify', async ({
    page,
  }) => {
    const { bookingId, contactEmail } = await createGuestInfoRequestedBooking(
      page,
      STAFF_EMAIL,
      INFO_REQUEST_MESSAGE,
    );
    const wrongSecretToken = mintGuestToken({
      bookingId,
      contactEmail,
      secret: 'a-completely-different-secret-than-the-real-one-used-by-the-app',
    });

    await page.goto(`/bookings/${bookingId}/submit-info?token=${wrongSecretToken}`);

    await expect(page.getByTestId('invalid-link-view')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Link inválido ou expirado' })).toBeVisible();
    // decodeUnverifiedTenantSlug() still resolves the real tenant's public branding.
    await expect(page.getByTestId('brand-name')).toHaveText('BELOAUTO');
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
