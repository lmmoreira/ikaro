import { test, expect } from '@playwright/test';

test.describe('Staff login (middleware regression)', () => {
  test('visiting /dashboard/login unauthenticated loads the page instead of redirect-looping', async ({
    page,
  }) => {
    // Regression: middleware.ts's auth guard matched /dashboard/login itself (it starts with
    // /dashboard), so an unauthenticated visit redirected to /dashboard/login, which re-triggered
    // the same guard — an infinite loop (ERR_TOO_MANY_REDIRECTS), for any visitor, regardless of
    // whether they have a staff record anywhere.
    const response = await page.goto('/dashboard/login');

    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Área da Equipe');
    // No slug → Google button is replaced with a "use your company's website" message.
    await expect(page.locator('a[href*="/auth/google?type=staff"]')).not.toBeAttached();
    await expect(page.getByTestId('staff-login-via-hotsite')).toBeVisible();
  });

  test('visiting a protected dashboard route unauthenticated still redirects to /dashboard/login', async ({
    page,
  }) => {
    await page.goto('/dashboard/bookings');

    await expect(page).toHaveURL('/dashboard/login');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Área da Equipe');
  });
});
