import { expect, test } from '@playwright/test';
import { loginAsStaff } from './helpers/auth';

// The picker is only reached by a Google account linked to several establishments, but it works
// for any signed-in staff member: the dev-login user simply sees the one establishment they
// belong to. Only the switch call is stubbed, the list itself is the real BFF response.
test.describe('select staff tenant', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStaff(page, 'admin@lavacar.com.br', 'lavacar-beloauto');
  });

  test('lists the establishment and opens its dashboard when picked', async ({ page }) => {
    await page.goto('/select-staff-tenant');

    await page.getByTestId('staff-tenant-option').click();

    // `/dashboard` redirects straight to the bookings queue, so the landing page is what settles.
    await expect(page).toHaveURL('/dashboard/bookings');
  });

  test('keeps the list and shows the failure when the switch is refused', async ({ page }) => {
    await page.route('**/api/auth/switch-staff-tenant', (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          status: 403,
          code: 'BFF_STAFF_NOT_REGISTERED_IN_TENANT',
          detail: 'Staff record not found or not active',
        }),
      }),
    );
    await page.goto('/select-staff-tenant');

    await page.getByTestId('staff-tenant-option').click();

    await expect(page.getByTestId('page-feedback')).toHaveText(
      'Você não está registrado neste estabelecimento.',
    );
    await expect(page.getByTestId('staff-tenant-option')).toBeEnabled();
    await expect(page).toHaveURL('/select-staff-tenant');
  });
});
