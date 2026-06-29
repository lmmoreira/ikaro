import type { Page } from '@playwright/test';

const WEB_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

async function patchCustomerProfile(page: Page, tenantSlug: string): Promise<void> {
  const payload =
    tenantSlug === 'ikaro'
      ? {
          phone: '+12125550123',
          defaultAddress: {
            street: '350 5th Ave',
            number: '1',
            city: 'New York',
            state: 'NY',
            zipCode: '10001',
          },
        }
      : {
          phone: '+5511999999999',
          defaultAddress: {
            street: 'Rua das Acácias',
            number: '45',
            neighborhood: 'Jardim América',
            city: 'Belo Horizonte',
            state: 'MG',
            zipCode: '30130-020',
          },
        };

  const res = await page.request.patch(
    `${WEB_URL}/api/customers/me?slug=${encodeURIComponent(tenantSlug)}`,
    {
      data: payload,
    },
  );
  if (!res.ok()) {
    throw new Error(`patch customer profile failed: ${res.status()} ${await res.text()}`);
  }
}

// Fills in phone + address through the web proxy, bypassing InformationCompletionPrompt's UI —
// for tests whose focus is elsewhere and that need the mandatory prompt to already be satisfied.
// Requires loginAsCustomer(page, ..., tenantSlug) to have run first, since this reuses the same
// cookie jar (page.request shares browser-context cookies regardless of the request's own origin).
export async function completeCustomerProfile(page: Page, tenantSlug: string): Promise<void> {
  await patchCustomerProfile(page, tenantSlug);
}

// Fills the visible prompt fields directly — use this when the test needs to exercise the
// prompt's own submit flow instead of bypassing it with a backend patch.
export async function fillValidAddress(page: Page): Promise<void> {
  await page.locator('#information-completion-address-street').fill('Rua das Acácias');
  await page.locator('#information-completion-address-number').fill('45');
  await page.locator('#information-completion-address-neighborhood').fill('Jardim América');
  await page.locator('#information-completion-address-city').fill('Belo Horizonte');
  await page.locator('#information-completion-address-state').fill('MG');
  await page.locator('#information-completion-address-zip-code').fill('30130-020');
}
