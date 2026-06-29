import { test, expect } from '@playwright/test';
import { loginAsCustomer, loginAsStaff, uniqueTestEmail } from './helpers/auth';
import { completeCustomerProfile } from './helpers/customer';

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

  test('anonymous visitor sees the staff area link pointing to the tenant-scoped login page', async ({
    page,
  }) => {
    await page.goto('/lavacar-beloauto');

    const staffLink = page.locator('[data-testid="hotsite-staff-link"]');
    await expect(staffLink).toBeVisible();
    await expect(staffLink).toHaveAttribute('href', '/dashboard/login?tenantSlug=lavacar-beloauto');
  });

  test('the auth bar also renders on the booking page', async ({ page }) => {
    await page.goto('/ikaro/booking');

    await expect(page.locator('[data-testid="hotsite-auth-bar"]')).toBeVisible();
  });
});

test.describe('Hotsite auth bar — authenticated states', () => {
  test('authenticated customer sees their name and the current tenant slug', async ({ page }) => {
    const email = uniqueTestEmail('auth-bar');
    await loginAsCustomer(page, email, 'lavacar-beloauto');

    await page.goto('/lavacar-beloauto');

    const summary = page.locator('[data-testid="hotsite-auth-bar"] summary');
    await expect(summary).toBeVisible();
    await expect(page.locator('[data-testid="hotsite-auth-tenant-slug"]')).toHaveText(
      'lavacar-beloauto',
    );
  });

  test('"Trocar empresa" is hidden for a customer who belongs to only one tenant', async ({
    page,
  }) => {
    const email = uniqueTestEmail('single-tenant');
    await loginAsCustomer(page, email, 'lavacar-beloauto');
    await completeCustomerProfile(page, 'lavacar-beloauto');

    await page.goto('/lavacar-beloauto');
    await page.locator('[data-testid="hotsite-auth-bar"] summary').click();

    await expect(page.locator('[data-testid="hotsite-switch-tenant-link"]')).not.toBeVisible();
  });

  test('"Trocar empresa" is visible for a customer who belongs to 2+ tenants', async ({ page }) => {
    const email = uniqueTestEmail('multi-tenant');
    await loginAsCustomer(page, email, 'lavacar-beloauto');
    await completeCustomerProfile(page, 'lavacar-beloauto');
    await loginAsCustomer(page, email, 'autospa-premium');
    await completeCustomerProfile(page, 'autospa-premium');

    await page.goto('/autospa-premium');
    await page.locator('[data-testid="hotsite-auth-bar"] summary').click();

    const switchLink = page.locator('[data-testid="hotsite-switch-tenant-link"]');
    await expect(switchLink).toBeVisible();
    await expect(switchLink).toHaveAttribute('href', '/switch-tenant');
  });

  test('signing out returns the customer to the unauthenticated "Entrar" state', async ({
    page,
  }) => {
    const email = uniqueTestEmail('sign-out');
    await loginAsCustomer(page, email, 'lavacar-beloauto');
    await completeCustomerProfile(page, 'lavacar-beloauto');

    await page.goto('/lavacar-beloauto');
    await page.locator('[data-testid="hotsite-auth-bar"] summary').click();
    await page.locator('[data-testid="hotsite-customer-logout-link"]').click();

    await expect(page).toHaveURL('/lavacar-beloauto');
    await expect(page.locator('[data-testid="hotsite-login-link"]')).toBeVisible();
  });

  test('authenticated staff sees their name and a link to the dashboard', async ({ page }) => {
    await loginAsStaff(page, 'funcionario@lavacar.com.br', 'lavacar-beloauto');

    await page.goto('/lavacar-beloauto');

    const staffLink = page.locator('[data-testid="hotsite-staff-authenticated-link"]');
    await expect(staffLink).toBeVisible();
    await expect(staffLink).toHaveAttribute('href', '/dashboard');
  });

  test('authenticated staff sees a Sair button that clears the session', async ({ page }) => {
    await loginAsStaff(page, 'funcionario@lavacar.com.br', 'lavacar-beloauto');

    await page.goto('/lavacar-beloauto');
    await expect(page.locator('[data-testid="hotsite-staff-authenticated-link"]')).toBeVisible();

    await page.locator('[data-testid="hotsite-staff-logout-link"]').click();

    await expect(page.locator('[data-testid="hotsite-staff-link"]')).toBeVisible();
    await expect(
      page.locator('[data-testid="hotsite-staff-authenticated-link"]'),
    ).not.toBeVisible();
  });

  test("staff authenticated at one tenant sees the unauthenticated state on a different tenant's hotsite", async ({
    page,
  }) => {
    await loginAsStaff(page, 'funcionario@lavacar.com.br', 'lavacar-beloauto');

    await page.goto('/autospa-premium');

    await expect(page.locator('[data-testid="hotsite-staff-link"]')).toBeVisible();
    await expect(
      page.locator('[data-testid="hotsite-staff-authenticated-link"]'),
    ).not.toBeVisible();

    // Back on their own tenant they are still authenticated.
    await page.goto('/lavacar-beloauto');
    await expect(page.locator('[data-testid="hotsite-staff-authenticated-link"]')).toBeVisible();
  });

  test("a customer authenticated at one tenant sees the unauthenticated state on a different tenant's hotsite (cross-tenant identity bug regression)", async ({
    page,
  }) => {
    const email = uniqueTestEmail('cross-tenant');
    await loginAsCustomer(page, email, 'lavacar-beloauto');

    // Same browser session, different tenant's hotsite — no Customer row exists for this
    // email at autospa-premium, so the auth bar must show "Entrar", not the BeloAuto identity.
    await page.goto('/autospa-premium');

    await expect(page.locator('[data-testid="hotsite-login-link"]')).toBeVisible();
    await expect(page.locator('[data-testid="hotsite-auth-bar"] summary')).not.toBeVisible();

    // The original tenant's session is untouched — navigating back shows the customer as
    // logged in there, same as before.
    await page.goto('/lavacar-beloauto');
    await expect(page.locator('[data-testid="hotsite-auth-bar"] summary')).toBeVisible();
  });
});
