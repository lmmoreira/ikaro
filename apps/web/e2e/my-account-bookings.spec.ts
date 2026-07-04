import { expect, test } from '@playwright/test';
import { loginAsCustomer, uniqueTestEmail } from './helpers/auth';
import { createAuthenticatedBooking, createFreshApprovedBooking } from './helpers/booking';

const TENANT_SLUG = 'lavacar-beloauto';
const STAFF_EMAIL = 'admin@lavacar.com.br';

test.describe('customer my-account: home + bookings list', () => {
  test('home shows the greeting, stat cards and an upcoming-booking preview linking to the full list', async ({
    page,
  }) => {
    const customerEmail = uniqueTestEmail('my-account-home');
    const setup = await createFreshApprovedBooking(page, 15, STAFF_EMAIL, {
      contactEmail: customerEmail,
    });
    await loginAsCustomer(page, customerEmail, TENANT_SLUG);

    await page.goto(`/${TENANT_SLUG}/my-account`);

    await expect(page.getByTestId('home-bookings-value')).toBeVisible();
    await expect(page.getByTestId('home-points-value')).toBeVisible();
    await expect(
      page.locator(`a[href="/${TENANT_SLUG}/my-account/bookings/${setup.bookingId}"]`),
    ).toBeVisible();

    await page.getByRole('link', { name: /Ver todos os agendamentos/ }).click();
    await expect(page).toHaveURL(`/${TENANT_SLUG}/my-account/bookings`);
  });

  test('bookings list splits Próximos/Pendentes/Histórico correctly for a customer with one of each', async ({
    page,
  }) => {
    const customerEmail = uniqueTestEmail('my-account-sections');
    const approved = await createFreshApprovedBooking(page, 16, STAFF_EMAIL, {
      contactEmail: customerEmail,
    });
    const pending = await createAuthenticatedBooking(page, {
      tenantSlug: TENANT_SLUG,
      emailPrefix: 'my-account-sections-pending',
      daysAhead: 17,
      contactEmail: customerEmail,
    });
    await loginAsCustomer(page, customerEmail, TENANT_SLUG);

    await page.goto(`/${TENANT_SLUG}/my-account/bookings`);

    const upcomingSection = page.getByTestId('section-upcoming');
    const pendingSection = page.getByTestId('section-pending');
    await expect(
      upcomingSection.locator(
        `a[href="/${TENANT_SLUG}/my-account/bookings/${approved.bookingId}"]`,
      ),
    ).toBeVisible();
    await expect(
      pendingSection.locator(`a[href="/${TENANT_SLUG}/my-account/bookings/${pending.bookingId}"]`),
    ).toBeVisible();
    await expect(page.getByTestId('section-history')).toHaveCount(0);
  });

  test('a customer with no bookings sees the empty state on both home and the bookings list', async ({
    page,
  }) => {
    const customerEmail = uniqueTestEmail('my-account-empty');
    await loginAsCustomer(page, customerEmail, TENANT_SLUG);

    await page.goto(`/${TENANT_SLUG}/my-account`);
    await expect(page.getByRole('link', { name: 'Fazer agendamento' })).toBeVisible();

    await page.goto(`/${TENANT_SLUG}/my-account/bookings`);
    await expect(page.getByRole('link', { name: 'Fazer agendamento' })).toBeVisible();
  });

  test('an APPROVED booking scheduled inside the cancellation window hides the cancel link', async ({
    page,
  }) => {
    const customerEmail = uniqueTestEmail('my-account-window-closed');
    // daysAhead: 0 schedules today, always inside the 48h cancellationWindowHours setting.
    const setup = await createFreshApprovedBooking(page, 0, STAFF_EMAIL, {
      contactEmail: customerEmail,
    });
    await loginAsCustomer(page, customerEmail, TENANT_SLUG);

    await page.goto(`/${TENANT_SLUG}/my-account/bookings`);

    const row = page.locator('li').filter({ has: page.locator(`a[href*="${setup.bookingId}"]`) });
    await expect(row.getByTestId('booking-window-closed-note')).toBeVisible();
    await expect(row.getByRole('link', { name: 'Cancelar' })).toHaveCount(0);
  });
});
