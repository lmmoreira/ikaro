import { expect, test } from '@playwright/test';
import { loginAsCustomer, uniqueTestEmail } from './helpers/auth';
import { createFreshApprovedBooking } from './helpers/booking';
import { completeCustomerProfile } from './helpers/customer';
import { createCompletedLoyaltyFlow } from './helpers/loyalty';

const TENANT_SLUG = 'lavacar-beloauto';
const STAFF_EMAIL = 'admin@lavacar.com.br';

test.describe('customer my-account: Fidelidade page', () => {
  test('shows the balance, an earned entry, and switches to the Resgates tab', async ({ page }) => {
    const customerEmail = uniqueTestEmail('loyalty-my-account');
    await createCompletedLoyaltyFlow(page, STAFF_EMAIL, customerEmail);
    await loginAsCustomer(page, customerEmail, TENANT_SLUG);

    await page.goto(`/${TENANT_SLUG}/my-account/loyalty`);

    await expect(page.getByTestId('loyalty-balance-points')).toBeVisible();
    await expect(page.getByTestId('loyalty-entry-row').first()).toBeVisible();

    await page.getByRole('tab', { name: 'Resgates' }).click();
    await expect(page.getByTestId('loyalty-redemption-row').first()).toBeVisible();
  });

  test('clicking an earned entry through to its booking, then back, returns to the loyalty page', async ({
    page,
  }) => {
    const customerEmail = uniqueTestEmail('loyalty-back-nav');
    await createCompletedLoyaltyFlow(page, STAFF_EMAIL, customerEmail);
    await loginAsCustomer(page, customerEmail, TENANT_SLUG);

    await page.goto(`/${TENANT_SLUG}/my-account/loyalty`);
    await page.getByTestId('loyalty-entry-row').first().click();
    await expect(page).toHaveURL(new RegExp(`/${TENANT_SLUG}/my-account/bookings/`));

    await page.getByTestId('topbar-back-link').click();
    await expect(page).toHaveURL(`/${TENANT_SLUG}/my-account/loyalty`);
  });

  test('on mobile, the bottom nav reaches the page and hides again on drill-down', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const customerEmail = uniqueTestEmail('loyalty-nav');
    const setup = await createFreshApprovedBooking(page, 23, STAFF_EMAIL, {
      contactEmail: customerEmail,
    });
    await loginAsCustomer(page, customerEmail, TENANT_SLUG);

    await page.goto(`/${TENANT_SLUG}/my-account`);
    const bottomNav = page.getByRole('navigation', { name: 'customer-bottom-nav' });
    await expect(bottomNav).toBeVisible();

    await bottomNav.getByRole('link', { name: 'Fidelidade' }).click();
    await expect(page).toHaveURL(`/${TENANT_SLUG}/my-account/loyalty`);
    await expect(bottomNav).toBeVisible();

    await page.goto(`/${TENANT_SLUG}/my-account/bookings/${setup.bookingId}`);
    await expect(bottomNav).toHaveCount(0);
  });

  test('on desktop, the tab nav reaches the page and stays visible on drill-down', async ({
    page,
  }) => {
    const customerEmail = uniqueTestEmail('loyalty-nav-desktop');
    await loginAsCustomer(page, customerEmail, TENANT_SLUG);
    await completeCustomerProfile(page, TENANT_SLUG);

    await page.goto(`/${TENANT_SLUG}/my-account`);
    const tabNav = page.getByRole('navigation', { name: 'customer-tabs' });
    await expect(tabNav).toBeVisible();

    await tabNav.getByRole('link', { name: 'Fidelidade' }).click();
    await expect(page).toHaveURL(`/${TENANT_SLUG}/my-account/loyalty`);
    await expect(tabNav).toBeVisible();
  });

  test('a customer with zero points and no entries sees the empty state', async ({ page }) => {
    const customerEmail = uniqueTestEmail('loyalty-empty');
    await loginAsCustomer(page, customerEmail, TENANT_SLUG);

    await page.goto(`/${TENANT_SLUG}/my-account/loyalty`);

    await expect(page.getByTestId('loyalty-empty-state')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Agendar agora' })).toBeVisible();
  });
});
