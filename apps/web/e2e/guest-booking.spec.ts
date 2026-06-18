import { test, expect } from '@playwright/test';

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
    await page.locator('[data-testid="service-card"][data-requires-pickup="false"]').first().click();
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
