import { test, expect } from '@playwright/test';
import { completeCustomerProfile, loginAsCustomer, uniqueTestEmail } from './helpers/auth';

test.describe('Switch tenant', () => {
  test('shows both tenants with the current one marked "Atual"', async ({ page }) => {
    const email = uniqueTestEmail('switch-list');
    await loginAsCustomer(page, email, 'lavacar-beloauto');
    await completeCustomerProfile(page, 'lavacar-beloauto');
    await loginAsCustomer(page, email, 'autospa-premium');
    await completeCustomerProfile(page, 'autospa-premium');

    await page.goto('/autospa-premium');
    await page.locator('[data-testid="hotsite-auth-bar"] summary').click();
    await page.locator('[data-testid="hotsite-switch-tenant-link"]').click();

    await expect(page).toHaveURL('/switch-tenant');
    const current = page.locator('[data-testid="switch-tenant-current"]');
    await expect(current).toContainText('AutoSpa Premium');
    await expect(current).toContainText('Atual');

    const option = page.locator('[data-testid="switch-tenant-option"]');
    await expect(option).toContainText('Lavacar BeloAuto');
  });

  test('renders in the current tenant\'s locale, not the global pt-BR default (regression: resolveLocale treated "switch-tenant" as a tenant slug)', async ({
    page,
  }) => {
    const email = uniqueTestEmail('switch-locale');
    // ikaro is the seed's only EN/US tenant. Log in to BeloAuto first (creates the second
    // membership), then ikaro last — addCookies() replaces the JWT, so the *last* login is the
    // "current" tenant when /switch-tenant is visited next.
    await loginAsCustomer(page, email, 'lavacar-beloauto');
    await loginAsCustomer(page, email, 'ikaro');

    await page.goto('/switch-tenant');

    await expect(page.locator('[data-testid="switch-tenant-heading"]')).toHaveText(
      'Switch company',
    );
    await expect(page.locator('[data-testid="switch-tenant-cancel"]')).toContainText(
      'Back without switching',
    );
  });

  test('a single-tenant customer landing on /switch-tenant directly is redirected back to their own tenant', async ({
    page,
  }) => {
    const email = uniqueTestEmail('switch-single');
    await loginAsCustomer(page, email, 'lavacar-beloauto');
    await completeCustomerProfile(page, 'lavacar-beloauto');

    await page.goto('/switch-tenant');

    await expect(page).toHaveURL('/lavacar-beloauto');
  });

  test('selecting the other tenant switches and lands authenticated on its hotsite', async ({
    page,
  }) => {
    const email = uniqueTestEmail('switch-select');
    await loginAsCustomer(page, email, 'lavacar-beloauto');
    await completeCustomerProfile(page, 'lavacar-beloauto');
    await loginAsCustomer(page, email, 'autospa-premium');
    await completeCustomerProfile(page, 'autospa-premium');

    await page.goto('/switch-tenant');
    await page.locator('[data-testid="switch-tenant-option"]').click();

    await expect(page).toHaveURL('/lavacar-beloauto');
    await expect(page.locator('[data-testid="hotsite-auth-bar"] summary')).toBeVisible();
    await expect(page.locator('[data-testid="hotsite-auth-tenant-slug"]')).toHaveText(
      'lavacar-beloauto',
    );
  });

  test('"Voltar sem trocar" returns to the original tenant with the customer still shown as logged in (regression: stale auth state after back navigation)', async ({
    page,
  }) => {
    const email = uniqueTestEmail('switch-cancel');
    await loginAsCustomer(page, email, 'lavacar-beloauto');
    await completeCustomerProfile(page, 'lavacar-beloauto');
    await loginAsCustomer(page, email, 'autospa-premium');
    await completeCustomerProfile(page, 'autospa-premium');

    await page.goto('/autospa-premium');
    await page.locator('[data-testid="hotsite-auth-bar"] summary').click();
    await page.locator('[data-testid="hotsite-switch-tenant-link"]').click();
    await expect(page).toHaveURL('/switch-tenant');

    await page.locator('[data-testid="switch-tenant-cancel"]').click();

    await expect(page).toHaveURL('/autospa-premium');
    await expect(page.locator('[data-testid="hotsite-auth-bar"] summary')).toBeVisible();
    await expect(page.locator('[data-testid="hotsite-auth-tenant-slug"]')).toHaveText(
      'autospa-premium',
    );
  });
});
