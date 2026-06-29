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

export async function fillValidAddress(page: Page, tenantSlug: string): Promise<void> {
  await patchCustomerProfile(page, tenantSlug);
}
