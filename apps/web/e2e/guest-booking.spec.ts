import { test, expect } from '@playwright/test';

test.describe('UC-001 — Guest booking golden path', () => {
  test('guest navigates from hotsite to booking form and submits successfully', async ({
    page,
  }) => {
    // Hotsite renders
    await page.goto('/ikaro');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('#service-list')).toBeVisible();

    // Navigate to booking form
    await page.goto('/ikaro/booking');
    await expect(page.getByRole('heading', { name: /escolha os serviços/i })).toBeVisible();

    // Step 1 — select first available service
    await page.locator('[data-testid="service-card"]').first().click();
    await page.locator('[data-testid="step-next"]').click();

    // Step 2 — pick first available day then first slot
    await page.locator('[data-testid="day-option"]:not([disabled])').first().click();
    await page.locator('[data-testid="time-slot"]').first().click();
    await page.locator('[data-testid="step-next"]').click();

    // Step 3 — personal info
    await page.getByLabel(/nome/i).fill('E2E Teste');
    await page.getByLabel(/e-mail/i).fill('e2e@teste.com.br');
    await page.getByLabel(/telefone/i).fill('11999999999');
    await page.locator('[data-testid="step-next"]').click();

    // Step 4 — submit
    await page.locator('[data-testid="step-confirm"]').click();
    await expect(page.locator('[data-testid="booking-success"]')).toBeVisible();
  });
});
