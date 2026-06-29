import type { Page } from '@playwright/test';

const BFF_URL = process.env.PLAYWRIGHT_BFF_URL ?? 'http://localhost:3002/v1';

const CUSTOMER_PROFILE_PATCH = {
  phone: '+5511999999999',
  defaultAddress: {
    street: 'Rua das Acácias',
    number: '45',
    neighborhood: 'Jardim América',
    city: 'Belo Horizonte',
    state: 'MG',
    zipCode: '30130-020',
  },
} as const;

async function patchCustomerProfile(page: Page, tenantSlug: string): Promise<void> {
  await page.request.patch(`${BFF_URL}/customers/me`, {
    headers: { 'X-Tenant-Slug': tenantSlug },
    data: CUSTOMER_PROFILE_PATCH,
  });
}

// Fills in phone + address directly via the BFF, bypassing InformationCompletionPrompt's UI —
// for tests whose focus is elsewhere and that need the mandatory prompt to already be satisfied.
// Requires loginAsCustomer(page, ..., tenantSlug) to have run first, since this reuses the same
// cookie jar (page.request shares browser-context cookies regardless of the request's own origin).
export async function completeCustomerProfile(page: Page, tenantSlug: string): Promise<void> {
  await patchCustomerProfile(page, tenantSlug);
}

// Fills the visible prompt fields directly — use this when the test needs to exercise the
// prompt's own submit flow instead of bypassing it with a backend patch.
export async function fillValidAddress(page: Page): Promise<void> {
  await page
    .locator('#information-completion-address-street')
    .fill(CUSTOMER_PROFILE_PATCH.defaultAddress.street);
  await page
    .locator('#information-completion-address-number')
    .fill(CUSTOMER_PROFILE_PATCH.defaultAddress.number);
  await page
    .locator('#information-completion-address-neighborhood')
    .fill(CUSTOMER_PROFILE_PATCH.defaultAddress.neighborhood);
  await page
    .locator('#information-completion-address-city')
    .fill(CUSTOMER_PROFILE_PATCH.defaultAddress.city);
  await page
    .locator('#information-completion-address-state')
    .fill(CUSTOMER_PROFILE_PATCH.defaultAddress.state);
  await page
    .locator('#information-completion-address-zip-code')
    .fill(CUSTOMER_PROFILE_PATCH.defaultAddress.zipCode);
}
