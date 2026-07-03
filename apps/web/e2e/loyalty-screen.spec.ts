import { expect, test } from '@playwright/test';
import { loginAsStaff, uniqueTestEmail } from './helpers/auth';
import {
  createCompletedLoyaltyFlow,
  LOYALTY_STAFF_TENANT_SLUG,
  openCustomerLoyaltyDetailByEmail,
} from './helpers/loyalty';

const STAFF_EMAIL = 'admin@lavacar.com.br';

test.describe('loyalty screen coverage', () => {
  test('shows earned points and redemption rows in the staff shell, with booking back-links preserving the loyalty tab', async ({
    page,
  }) => {
    const customerEmail = uniqueTestEmail('loyalty-screen');
    const setup = await createCompletedLoyaltyFlow(page, STAFF_EMAIL, customerEmail);

    await loginAsStaff(page, STAFF_EMAIL, LOYALTY_STAFF_TENANT_SLUG);

    const detailPath = await openCustomerLoyaltyDetailByEmail(page, customerEmail);

    await expect(page.locator('aside').getByRole('link', { name: 'Fidelidade' })).toBeVisible();
    await expect(page.getByText('Lavagem Completa')).toBeVisible();
    await expect(page.getByText('pontos ativos')).toBeVisible();
    await expect(
      page.getByRole('link', { name: new RegExp(setup.earnedBookingId.slice(0, 8)) }),
    ).toBeVisible();

    await page.getByRole('link', { name: new RegExp(setup.earnedBookingId.slice(0, 8)) }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/bookings/${setup.earnedBookingId}`));
    const bookingBackLink = page.locator('header').getByRole('link', { name: 'Fidelidade' });
    await expect(bookingBackLink).toBeVisible();
    await expect(bookingBackLink).toHaveAttribute('href', detailPath);

    await bookingBackLink.click();
    await expect(page).toHaveURL(detailPath);

    await page.getByRole('button', { name: 'Resgates' }).click();
    await expect(page.getByText('Resgate no agendamento')).toBeVisible();
    await expect(
      page.getByRole('link', { name: new RegExp(setup.redeemBookingId.slice(0, 8)) }),
    ).toBeVisible();

    await page.getByRole('link', { name: new RegExp(setup.redeemBookingId.slice(0, 8)) }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/bookings/${setup.redeemBookingId}`));
    await expect(bookingBackLink).toBeVisible();
    await expect(bookingBackLink).toHaveAttribute('href', `${detailPath}?tab=redemptions`);

    await bookingBackLink.click();
    await expect(page).toHaveURL(`${detailPath}?tab=redemptions`);
  });
});
