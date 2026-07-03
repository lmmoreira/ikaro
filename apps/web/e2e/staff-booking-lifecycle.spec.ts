import { expect, test } from '@playwright/test';
import { loginAsStaff, uniqueTestEmail } from './helpers/auth';
import { createAuthenticatedBooking, createFreshApprovedBooking } from './helpers/booking';

const TENANT_SLUG = 'lavacar-beloauto';
const STAFF_EMAIL = 'admin@lavacar.com.br';
const SERVICE_COMPLETA_ID = '00000000-0000-7000-8003-000000000002';
test.describe('staff booking lifecycle coverage', () => {
  test('queue card body still opens booking detail', async ({ page }) => {
    const setup = await createAuthenticatedBooking(page, {
      tenantSlug: TENANT_SLUG,
      emailPrefix: 'queue-detail',
      daysAhead: 7,
    });

    await loginAsStaff(page, STAFF_EMAIL, TENANT_SLUG);
    await page.goto('/dashboard/bookings');

    await page.locator(`a[href="/dashboard/bookings/${setup.bookingId}"]`).click();

    await expect(page).toHaveURL(`/dashboard/bookings/${setup.bookingId}`);
    await expect(page.getByRole('button', { name: 'Aprovar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pedir info' })).toBeVisible();
  });

  test('queue quick approve keeps the staff on the queue and removes the pending action', async ({
    page,
  }) => {
    const setup = await createAuthenticatedBooking(page, {
      tenantSlug: TENANT_SLUG,
      emailPrefix: 'queue-approve',
      daysAhead: 8,
    });

    await loginAsStaff(page, STAFF_EMAIL, TENANT_SLUG);
    await page.goto('/dashboard/bookings');

    const card = page
      .locator(`a[href="/dashboard/bookings/${setup.bookingId}"]`)
      .locator('xpath=..');
    await expect(card.getByRole('button', { name: 'Aprovar' })).toBeVisible();

    await card.getByRole('button', { name: 'Aprovar' }).click();

    await expect(page).toHaveURL('/dashboard/bookings');
    await expect(card.getByRole('button', { name: 'Aprovar' })).toHaveCount(0);
  });

  test('reject happy path shows the inline rejection summary and the right-side action panel', async ({
    page,
  }) => {
    const setup = await createAuthenticatedBooking(page, {
      tenantSlug: TENANT_SLUG,
      emailPrefix: 'reject',
      daysAhead: 9,
    });

    await loginAsStaff(page, STAFF_EMAIL, TENANT_SLUG);
    await page.goto(`/dashboard/bookings/${setup.bookingId}`);

    await page.getByRole('button', { name: 'Rejeitar' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox').fill('Cliente pediu reagendamento para outra data');
    await dialog.getByRole('button', { name: 'Rejeitar' }).click();

    await expect(page.getByTestId('booking-rejected-title')).toBeVisible();
    await expect(page.getByTestId('booking-rejected-reason')).toBeVisible();
    await expect(page.getByTestId('booking-rejected-notification')).toBeVisible();
    await expect(
      page.locator('main aside').getByRole('link', { name: 'Voltar à agenda' }),
    ).toBeVisible();
  });

  test('request info happy path shows the inline info-request summary and the right-side action panel', async ({
    page,
  }) => {
    const setup = await createAuthenticatedBooking(page, {
      tenantSlug: TENANT_SLUG,
      emailPrefix: 'request-info',
      daysAhead: 10,
    });

    await loginAsStaff(page, STAFF_EMAIL, TENANT_SLUG);
    await page.goto(`/dashboard/bookings/${setup.bookingId}`);

    await page.getByRole('button', { name: 'Pedir info' }).click();
    const dialog = page.getByRole('dialog');
    await dialog
      .getByRole('textbox')
      .fill('Confirme o endereço de coleta antes do horário agendado.');
    await dialog.getByRole('button', { name: 'Enviar' }).click();

    await expect(page.getByTestId('booking-info-requested-title')).toBeVisible();
    await expect(page.getByTestId('booking-info-requested-message')).toBeVisible();
    await expect(page.getByTestId('booking-info-requested-status')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aprovar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rejeitar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pedir info' })).toHaveCount(0);
  });

  test('complete success shows the centered summary and the right-side action panel', async ({
    page,
  }) => {
    const setup = await createFreshApprovedBooking(page, 9, STAFF_EMAIL);

    await page.goto(`/dashboard/bookings/${setup.bookingId}/complete`);

    await expect(page.getByRole('button', { name: 'Confirmar conclusão' })).toBeVisible();
    await expect(page.getByTestId('complete-line-name').first()).toContainText('Lavagem Simples');
    await expect(page.getByTestId('complete-summary-quoted')).toBeVisible();
    await expect(page.getByTestId('complete-summary-charged')).toBeVisible();

    await page.getByRole('button', { name: 'Confirmar conclusão' }).click();

    await expect(page.getByTestId('outcome-banner-title')).toBeVisible();
    await expect(
      page.locator('main aside').getByRole('link', { name: 'Voltar à agenda' }),
    ).toBeVisible();
    await expect(page.getByTestId('complete-email-summary')).toBeVisible();
  });

  test('complete loyalty flow earns points on one booking and redeems them on the next', async ({
    page,
  }) => {
    const customerEmail = uniqueTestEmail('loyalty-flow');

    const earnedSetup = await createFreshApprovedBooking(page, 9, STAFF_EMAIL, {
      contactEmail: customerEmail,
      serviceIds: [SERVICE_COMPLETA_ID],
    });

    await page.goto(`/dashboard/bookings/${earnedSetup.bookingId}/complete`);
    await page.getByRole('button', { name: 'Confirmar conclusão' }).click();

    await expect(page.getByTestId('outcome-banner-title')).toBeVisible();
    await expect(page.getByTestId('booking-loyalty-points-active')).toBeVisible();

    const redeemSetup = await createFreshApprovedBooking(page, 10, STAFF_EMAIL, {
      contactEmail: customerEmail,
      serviceIds: [SERVICE_COMPLETA_ID],
    });

    await page.goto(`/dashboard/bookings/${redeemSetup.bookingId}/complete`);

    await expect(page.getByTestId('complete-loyalty-section-title')).toBeVisible();
    await expect(page.getByTestId('complete-loyalty-available-points')).toBeVisible();
    await expect(page.getByTestId('complete-loyalty-rate-hint')).toBeVisible();

    await page.getByRole('button', { name: 'Usar todos' }).click();
    await expect(page.getByRole('spinbutton', { name: 'Pontos a usar' })).toHaveValue('10');
    await expect(page.getByTestId('complete-summary-points-earned')).toBeVisible();

    const completeRequest = page.waitForRequest(
      (request) =>
        request.method() === 'PATCH' &&
        request.url().endsWith(`/bookings/${redeemSetup.bookingId}/complete`),
    );

    await page.getByRole('button', { name: 'Confirmar conclusão' }).click();

    const request = await completeRequest;
    const requestBody = request.postDataJSON() as {
      readonly lines: Array<{ readonly lineId: string; readonly actualPriceCharged: number }>;
      readonly discountByPoints?: {
        readonly pointsUsed: number;
        readonly amountDeducted: number;
      };
    };
    expect(requestBody.lines).toHaveLength(1);
    expect(requestBody.lines[0].actualPriceCharged).toBe(150);
    expect(requestBody.discountByPoints).toEqual({
      pointsUsed: 10,
      amountDeducted: 1,
    });

    await expect(page.getByTestId('outcome-banner-title')).toBeVisible();
    await expect(page.getByTestId('booking-loyalty-points-active')).toBeVisible();
    await expect(page.getByTestId('complete-loyalty-discount-applied')).toHaveText(
      'Desconto fidelidade: -R$ 1,00',
    );

    await page.goto(`/dashboard/bookings/${redeemSetup.bookingId}`);

    await expect(page.getByTestId('booking-completed-title')).toBeVisible();
    await expect(page.getByText('Total cobrado: R$ 149,00')).toBeVisible();
    await expect(page.getByTestId('complete-loyalty-discount-applied')).toHaveText(
      'Desconto fidelidade: -R$ 1,00',
    );
    await expect(page.getByRole('link', { name: 'Voltar à agenda' })).toBeVisible();
  });

  test('reschedule success shows a full De/Para summary and the action panel on the right', async ({
    page,
  }) => {
    const setup = await createFreshApprovedBooking(page, 10, STAFF_EMAIL);

    await page.goto(`/dashboard/bookings/${setup.bookingId}/reschedule`);

    const desktopAside = page.locator('main aside');
    await expect(desktopAside).toContainText('Ainda não selecionado');

    await page.locator('[data-testid="day-option"]:not([disabled])').last().click();
    await page.locator('[data-testid="time-slot"]').first().click();

    await expect(desktopAside).toContainText('De');
    await expect(desktopAside).toContainText('Para');
    await expect(desktopAside).not.toContainText('Ainda não selecionado');

    await page.getByRole('button', { name: 'Reagendar' }).click();

    await expect(page.getByTestId('outcome-banner-title')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ver detalhe atualizado' })).toBeVisible();
    await expect(page.getByTestId('reschedule-body-email')).toBeVisible();
    await expect(
      page.locator('main aside').getByRole('link', { name: 'Voltar à agenda' }),
    ).toBeVisible();
  });

  test('cancel success keeps the message centered and the back action in the right panel', async ({
    page,
  }) => {
    const setup = await createFreshApprovedBooking(page, 11, STAFF_EMAIL);

    await page.goto(`/dashboard/bookings/${setup.bookingId}`);

    await page.getByRole('button', { name: 'Cancelar agendamento' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Cancelar agendamento' }).click();

    await expect(page.getByTestId('booking-cancelled-title')).toBeVisible();
    await expect(page.getByTestId('booking-cancelled-email')).toBeVisible();
    await expect(
      page.locator('main aside').getByRole('link', { name: 'Voltar à agenda' }),
    ).toBeVisible();
  });
});
