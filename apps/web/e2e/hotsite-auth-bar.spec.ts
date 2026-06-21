import { test, expect } from '@playwright/test';

test.describe('M13-S42 — Hotsite auth bar', () => {
  test('anonymous visitor sees the localized login CTA on the hotsite and reaches the tenant-branded login page', async ({
    page,
  }) => {
    await page.goto('/ikaro');

    const loginLink = page.locator('[data-testid="hotsite-login-link"]');
    await expect(loginLink).toBeVisible();
    await expect(loginLink).toHaveAttribute('href', '/ikaro/login');

    await loginLink.click();
    await expect(page).toHaveURL('/ikaro/login');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Sign in to');

    const googleButton = page.locator('[data-testid="google-login"]');
    await expect(googleButton).toBeVisible();
    await expect(googleButton).toHaveAttribute('href', /\/auth\/google\?tenantSlug=ikaro/);
  });

  test('the auth bar also renders on the booking page', async ({ page }) => {
    await page.goto('/ikaro/booking');

    await expect(page.locator('[data-testid="hotsite-auth-bar"]')).toBeVisible();
  });
});
