import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('UC-001 — Guest booking golden path', () => {
  test('guest navigates from hotsite to booking form and submits successfully', async ({
    page,
  }) => {
    // Hotsite renders
    await page.goto('/ikaro');
    await expect(page.locator('#service-list')).toBeVisible();

    // Navigate to booking form — step 1 visible
    await page.goto('/ikaro/booking');
    await expect(page.locator('[data-testid="step-service-selection"]')).toBeVisible();

    // Step 1 — select first service that does not require pickup address
    await page
      .locator('[data-testid="service-card"][data-requires-pickup="false"]')
      .first()
      .click();
    await page.locator('[data-testid="step-next"]').click();

    // Step 2 — pick first available day then first slot
    await page.locator('[data-testid="day-option"]:not([disabled])').first().click();
    await page.locator('[data-testid="time-slot"]').first().click();
    await page.locator('[data-testid="step-next"]').click();

    // Step 3 — personal info
    await page.locator('[data-testid="input-name"]').fill('E2E Teste');
    await page.locator('[data-testid="input-email"]').fill('e2e@teste.com.br');
    await page.locator('[data-testid="input-phone"]').fill('11999999999');
    await page.locator('[data-testid="step-next"]').click();

    // Step 4 — submit
    await page.locator('[data-testid="step-confirm"]').click();
    await expect(page.locator('[data-testid="booking-success"]')).toBeVisible();
  });
});

// ── Shared helper: navigate to step 3 (personal info) ────────────────────────
async function navigateToStep3(page: Page) {
  await page.goto('/ikaro/booking');
  await expect(page.locator('[data-testid="step-service-selection"]')).toBeVisible();

  await page.locator('[data-testid="service-card"][data-requires-pickup="false"]').first().click();
  await page.locator('[data-testid="step-next"]').click();

  await page.locator('[data-testid="day-option"]:not([disabled])').first().click();
  await page.locator('[data-testid="time-slot"]').first().click();
  await page.locator('[data-testid="step-next"]').click();

  await expect(page.locator('[data-testid="input-name"]')).toBeVisible();
}

test.describe('UC-001 — Booking form error paths', () => {
  test('step 3: shows validation error when required fields are empty', async ({ page }) => {
    await navigateToStep3(page);

    // Click next without filling any field
    await page.locator('[data-testid="step-next"]').click();

    await expect(page.locator('[data-testid="personal-info-error"]')).toBeVisible();
    // Step 3 remains — did not advance
    await expect(page.locator('[data-testid="input-name"]')).toBeVisible();
  });

  test('step 1: shows error when pickup-required service selected without address', async ({
    page,
  }) => {
    await page.goto('/lavacar-beloauto/booking');
    await expect(page.locator('[data-testid="step-service-selection"]')).toBeVisible();

    // Select Polimento — the only seeded service with requires_pickup_address = true
    await page.locator('[data-testid="service-card"][data-requires-pickup="true"]').first().click();

    // Try to advance without filling the pickup address
    await page.locator('[data-testid="step-next"]').click();

    await expect(page.locator('[data-testid="step1-error"]')).toBeVisible();
    // Still on step 1
    await expect(page.locator('[data-testid="step-service-selection"]')).toBeVisible();
  });

  test('step 4: shows error message when booking POST fails (500)', async ({ page }) => {
    // Intercept the BFF booking endpoint and return a server error
    await page.route('**/v1/bookings', (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ title: 'Internal Server Error' }) }),
    );

    await navigateToStep3(page);

    await page.locator('[data-testid="input-name"]').fill('E2E Teste');
    await page.locator('[data-testid="input-email"]').fill('e2e@teste.com.br');
    await page.locator('[data-testid="input-phone"]').fill('11999999999');
    await page.locator('[data-testid="step-next"]').click();

    await page.locator('[data-testid="step-confirm"]').click();

    await expect(page.locator('[data-testid="confirmation-error"]')).toBeVisible();
  });

  test('back navigation: step 3 back button returns to step 2', async ({ page }) => {
    await navigateToStep3(page);

    await page.locator('[data-testid="step-back"]').click();

    // Back on step 2 — day/slot picker visible again
    await expect(page.locator('[data-testid="day-option"]').first()).toBeVisible();
  });
});

test.describe('UC-001 — Accessibility (axe)', () => {
  test('hotsite landing page has no axe violations', async ({ page }) => {
    await page.goto('/ikaro');
    await expect(page.locator('#service-list')).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('booking form step 1 has no axe violations', async ({ page }) => {
    await page.goto('/ikaro/booking');
    await expect(page.locator('[data-testid="step-service-selection"]')).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
