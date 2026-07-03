import { expect, type Page } from '@playwright/test';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function openCustomerLoyaltyDetailByEmail(
  page: Page,
  customerEmail: string,
): Promise<string> {
  await page.goto('/dashboard/loyalty');

  await expect(page.locator('aside')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Fidelidade' })).toBeVisible();

  await page.getByRole('searchbox').fill(customerEmail);

  const customerLink = page.getByRole('link', {
    name: new RegExp(escapeRegExp(customerEmail)),
  });
  await expect(customerLink).toBeVisible();
  await customerLink.click();

  await expect(page).toHaveURL(/\/dashboard\/loyalty\/[0-9a-f-]+$/i);

  const url = new URL(page.url());
  return `${url.pathname}${url.search}`;
}
