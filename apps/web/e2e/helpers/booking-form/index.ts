import { expect, type Page } from '@playwright/test';
import { completeCustomerProfile } from '../customer';
import { loginAsCustomer, uniqueTestEmail } from '../auth';

export async function navigateToStep3(page: Page, tenantSlug = 'ikaro'): Promise<void> {
  await page.goto(`/${tenantSlug}/booking`);
  await page.locator('[data-testid="step-service-selection"]').waitFor();

  await page.locator('[data-testid="service-card"][data-requires-pickup="false"]').first().click();
  await page.locator('[data-testid="step-next"]').click();

  await page.locator('[data-testid="day-option"]:not([disabled])').first().click();
  await page.locator('[data-testid="time-slot"]').first().click();
  await page.locator('[data-testid="step-next"]').click();

  await expect(page.locator('[data-testid="input-name"]')).toBeVisible();
}

export async function navigateToAuthenticatedStep3(
  page: Page,
  tenantSlug = 'ikaro',
): Promise<void> {
  await loginAsCustomer(page, uniqueTestEmail(`booking-auth-${tenantSlug}`), tenantSlug);
  await completeCustomerProfile(page, tenantSlug);

  await page.goto(`/${tenantSlug}/booking`);
  await page.locator('[data-testid="step-service-selection"]').waitFor();

  await page.locator('[data-testid="service-card"][data-requires-pickup="false"]').first().click();
  await page.locator('[data-testid="step-next"]').click();

  await page.locator('[data-testid="day-option"]:not([disabled])').first().click();
  await page.locator('[data-testid="time-slot"]').first().click();
  await page.locator('[data-testid="step-next"]').click();
}
