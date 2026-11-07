import { expect, test } from '@playwright/test';
import { loginAsCustomer, uniqueTestEmail } from './helpers/auth';
import {
  createAuthenticatedBooking,
  createFreshApprovedBooking,
  createSoonestApprovedBookingInOwnRoom,
} from './helpers/booking';

const TENANT_SLUG = 'lavacar-beloauto';
const STAFF_EMAIL = 'admin@lavacar.com.br';

test.describe('customer my-account: home + bookings list', () => {
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

    await test.step('home shows the greeting, stat cards and an upcoming-booking preview linking to the full list', async () => {
      // The approved booking above is this customer's one upcoming booking.
      const setup = approved;

      await page.goto(`/${TENANT_SLUG}/my-account`);

      await expect(page.getByTestId('home-bookings-value')).toBeVisible();
      await expect(page.getByTestId('home-points-value')).toBeVisible();
      await expect(
        page.locator(`a[href="/${TENANT_SLUG}/my-account/bookings/${setup.bookingId}"]`),
      ).toBeVisible();

      await page.getByRole('link', { name: /Ver todos os agendamentos/ }).click();
      await expect(page).toHaveURL(`/${TENANT_SLUG}/my-account/bookings`);
    });
  });

  test('an APPROVED booking scheduled inside the cancellation window hides the cancel link', async ({
    page,
  }) => {
    const customerEmail = uniqueTestEmail('my-account-window-closed');
    // 'soonest' is the nearest open slot, so it is inside the 48h cancellationWindowHours setting
    // whatever weekday the run happens on (a weekday offset lands on Monday from a Friday). It is
    // booked on a room of its own: the few slots a 48h look-ahead leaves (two on a Saturday) are
    // not shared with the other specs that need one.
    const { setup, cleanup } = await createSoonestApprovedBookingInOwnRoom(page, {
      prefix: 'e2e-window-closed',
      contactEmail: customerEmail,
      staffEmail: STAFF_EMAIL,
    });
    try {
      await loginAsCustomer(page, customerEmail, TENANT_SLUG);

      await page.goto(`/${TENANT_SLUG}/my-account/bookings`);

      const row = page.locator('li').filter({ has: page.locator(`a[href*="${setup.bookingId}"]`) });
      await expect(row.getByTestId('booking-window-closed-note')).toBeVisible();
      await expect(row.getByRole('link', { name: 'Cancelar' })).toHaveCount(0);
    } finally {
      await cleanup();
    }
  });
});
