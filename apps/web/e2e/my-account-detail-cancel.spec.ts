import { expect, test } from '@playwright/test';
import { loginAsCustomer, uniqueTestEmail } from './helpers/auth';
import {
  createAuthenticatedBooking,
  createFreshApprovedBooking,
  createInfoRequestedBooking,
} from './helpers/booking';
import { createCompletedLoyaltyFlow } from './helpers/loyalty';

const TENANT_SLUG = 'lavacar-beloauto';
const STAFF_EMAIL = 'admin@lavacar.com.br';

test.describe('customer my-account: booking detail, cancel and info-submit', () => {
  test('APPROVED within the window: cancel confirmation redirects to the list with the booking cancelled', async ({
    page,
  }) => {
    const customerEmail = uniqueTestEmail('detail-cancel-approved');
    const setup = await createFreshApprovedBooking(page, 18, STAFF_EMAIL, {
      contactEmail: customerEmail,
    });
    await loginAsCustomer(page, customerEmail, TENANT_SLUG);

    await page.goto(`/${TENANT_SLUG}/my-account/bookings/${setup.bookingId}`);
    await expect(page.getByTestId('booking-detail-status-badge')).toBeVisible();

    await page
      .getByTestId('action-pane-desktop')
      .getByRole('link', { name: 'Cancelar agendamento' })
      .click();
    await expect(page).toHaveURL(`/${TENANT_SLUG}/my-account/bookings/${setup.bookingId}/cancel`);

    await page.getByRole('button', { name: 'Confirmar cancelamento' }).click();
    await expect(page).toHaveURL(`/${TENANT_SLUG}/my-account`);

    await page.goto(`/${TENANT_SLUG}/my-account/bookings/${setup.bookingId}`);
    await expect(page.getByTestId('booking-detail-status-badge')).toContainText('Cancelado');
  });

  test('PENDING: "Cancelar solicitação" confirmation cancels the request', async ({ page }) => {
    const customerEmail = uniqueTestEmail('detail-cancel-pending');
    const setup = await createAuthenticatedBooking(page, {
      tenantSlug: TENANT_SLUG,
      emailPrefix: 'detail-cancel-pending',
      daysAhead: 19,
      contactEmail: customerEmail,
    });
    await loginAsCustomer(page, customerEmail, TENANT_SLUG);

    await page.goto(`/${TENANT_SLUG}/my-account/bookings/${setup.bookingId}`);
    await page
      .getByTestId('action-pane-desktop')
      .getByRole('link', { name: 'Cancelar solicitação' })
      .click();
    await page.getByRole('button', { name: 'Confirmar cancelamento' }).click();

    await expect(page).toHaveURL(`/${TENANT_SLUG}/my-account`);
  });

  test('cancelling an APPROVED booking outside the window redirects to the error page', async ({
    page,
  }) => {
    const customerEmail = uniqueTestEmail('detail-cancel-outside-window');
    // daysAhead: 0 schedules today, always inside the 48h cancellationWindowHours setting —
    // i.e. already outside the window a customer is allowed to self-cancel from.
    const setup = await createFreshApprovedBooking(page, 0, STAFF_EMAIL, {
      contactEmail: customerEmail,
    });
    await loginAsCustomer(page, customerEmail, TENANT_SLUG);

    await page.goto(`/${TENANT_SLUG}/my-account/bookings/${setup.bookingId}/cancel`);
    await page.getByRole('button', { name: 'Confirmar cancelamento' }).click();

    await expect(page).toHaveURL(
      `/${TENANT_SLUG}/my-account/bookings/${setup.bookingId}/cancel/error`,
    );
    await expect(page.getByRole('link', { name: 'Voltar ao agendamento' })).toBeVisible();
  });

  test('INFO_REQUESTED: submitting a response shows a confirmation and flips the badge to PENDING', async ({
    page,
  }) => {
    const customerEmail = uniqueTestEmail('detail-info-submit');
    const setup = await createInfoRequestedBooking(
      page,
      22,
      STAFF_EMAIL,
      'Confirme o endereço de coleta antes do horário agendado.',
      { contactEmail: customerEmail },
    );
    await loginAsCustomer(page, customerEmail, TENANT_SLUG);

    await page.goto(`/${TENANT_SLUG}/my-account/bookings/${setup.bookingId}`);
    await expect(page.getByTestId('booking-detail-status-badge')).toContainText('Info pedida');

    await page.getByRole('button', { name: 'Enviar resposta' }).click();
    await expect(page.getByTestId('info-validation-error')).toBeVisible();

    await page.locator('#info-response').fill('Sim, pode confirmar o endereço.');
    await page.getByRole('button', { name: 'Enviar resposta' }).click();

    await expect(page.getByTestId('booking-detail-status-badge')).toContainText('Aguardando');
    await expect(page.locator('#info-response')).toHaveCount(0);
  });

  test('COMPLETED: shows the charged price and points-earned banner, with no cancel action', async ({
    page,
  }) => {
    const customerEmail = uniqueTestEmail('detail-completed');
    const flow = await createCompletedLoyaltyFlow(page, STAFF_EMAIL, customerEmail);
    await loginAsCustomer(page, customerEmail, TENANT_SLUG);

    await page.goto(`/${TENANT_SLUG}/my-account/bookings/${flow.earnedBookingId}`);

    await expect(page.getByTestId('points-earned-banner')).toBeVisible();
    await expect(page.getByTestId('booking-total-value')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Cancelar agendamento' })).toHaveCount(0);
    await expect(
      page.getByTestId('action-pane-desktop').getByRole('link', { name: 'Ver meus pontos →' }),
    ).toBeVisible();
  });

  test("a customer cannot view another customer's booking (404, not 403)", async ({ page }) => {
    const ownerEmail = uniqueTestEmail('detail-ownership-owner');
    const setup = await createAuthenticatedBooking(page, {
      tenantSlug: TENANT_SLUG,
      emailPrefix: 'detail-ownership-owner',
      daysAhead: 20,
      contactEmail: ownerEmail,
    });

    const otherEmail = uniqueTestEmail('detail-ownership-other');
    await loginAsCustomer(page, otherEmail, TENANT_SLUG);

    const res = await page.goto(`/${TENANT_SLUG}/my-account/bookings/${setup.bookingId}`);
    expect(res?.status()).toBe(404);
  });

  test('an unauthenticated visitor is redirected to login', async ({ page }) => {
    await page.context().clearCookies();

    await page.goto(`/${TENANT_SLUG}/my-account/bookings/00000000-0000-7000-8005-000000000002`);

    await expect(page).toHaveURL(new RegExp(`/${TENANT_SLUG}/login`));
  });
});
