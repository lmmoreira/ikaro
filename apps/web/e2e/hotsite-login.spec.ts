import { test, expect } from '@playwright/test';

test.describe('TD57-S16 — Hotsite login failure', () => {
  test('a failed sign-in shows the branded alert under the Google button and keeps the button', async ({
    page,
  }) => {
    await page.goto('/ikaro/login?error=oauth_failed');

    const googleButton = page.locator('[data-testid="google-login"]');
    await expect(googleButton).toBeVisible();
    await expect(googleButton).toHaveAttribute('href', /\/auth\/google\?tenantSlug=ikaro/);

    // Scoped to <main>: Next's route announcer is a role=alert element outside it.
    const alert = page.locator('main').getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).not.toBeEmpty();

    const buttonBox = await googleButton.boundingBox();
    const alertBox = await alert.boundingBox();
    expect(buttonBox).not.toBeNull();
    expect(alertBox).not.toBeNull();
    expect(alertBox!.y).toBeGreaterThan(buttonBox!.y);

    await test.step('a plain visit shows no alert', async () => {
      await page.goto('/ikaro/login');

      await expect(page.locator('[data-testid="google-login"]')).toBeVisible();
      await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
    });
  });
});
