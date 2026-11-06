import { expect, test, type Page } from '@playwright/test';
import { gotoBookingPage } from './helpers/booking-form/goto';

const BFF_URL = process.env.PLAYWRIGHT_BFF_URL ?? 'http://localhost:3002/v1';
const WEB_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
// TD38: every direct-BFF call (bypassing the /v1 same-origin gateway) must send this, same as
// e2e/helpers/auth/shared.ts's identical export — this file predates that shared helper and
// still keeps its own inline dev-login call, which was missed by the sweep that added this
// header to the 12 files under e2e/helpers/**.
const WEB_INTERNAL_KEY = process.env.WEB_INTERNAL_KEY;

if (!INTERNAL_API_KEY) {
  throw new Error('PLAYWRIGHT/INTERNAL_API_KEY is required for dev-login E2E helpers');
}

if (!WEB_INTERNAL_KEY) {
  throw new Error('WEB_INTERNAL_KEY is required for direct-BFF E2E helpers (TD38)');
}

function uniqueTestEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}@e2e.example.com`;
}

async function loginAsCustomer(page: Page, email: string, tenantSlug: string): Promise<void> {
  const res = await page.request.post(`${BFF_URL}/auth/dev-login`, {
    headers: { 'X-Internal-Key': INTERNAL_API_KEY!, 'X-Web-Internal-Key': WEB_INTERNAL_KEY! },
    data: { email, tenantSlug, type: 'customer' },
  });
  if (!res.ok()) throw new Error(`dev-login failed: ${res.status()} ${await res.text()}`);
  const body = (await res.json()) as { accessToken: string };

  await page.context().addCookies([
    {
      name: 'access_token',
      value: body.accessToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

async function completeCustomerProfile(page: Page, tenantSlug: string): Promise<void> {
  const defaultAddress =
    tenantSlug === 'ikaro'
      ? {
          street: '350 5th Ave',
          number: '1',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
        }
      : {
          street: 'Rua das Acácias',
          number: '45',
          neighborhood: 'Jardim América',
          city: 'Belo Horizonte',
          state: 'MG',
          zipCode: '30130-020',
        };
  const phone = tenantSlug === 'ikaro' ? '+12125550123' : '+5511999999999';

  const res = await page.request.patch(
    `${WEB_URL}/api/customers/me?slug=${encodeURIComponent(tenantSlug)}`,
    {
      data: {
        phone,
        defaultAddress,
      },
    },
  );
  if (!res.ok()) throw new Error(`profile patch failed: ${res.status()} ${await res.text()}`);
}

async function setupAuthenticatedCustomer(page: Page, tenantSlug: string): Promise<void> {
  await loginAsCustomer(page, uniqueTestEmail(`booking-auth-${tenantSlug}`), tenantSlug);
  await completeCustomerProfile(page, tenantSlug);
}

test.describe('UC-002 — Authenticated customer booking golden path', () => {
  test('authenticated customer sees the default pickup address on step 1', async ({ page }) => {
    await setupAuthenticatedCustomer(page, 'lavacar-beloauto');

    await gotoBookingPage(page, '/lavacar-beloauto/booking');
    await page.locator('[data-testid="step-service-selection"]').waitFor();
    await expect(page.locator('[data-testid="information-completion-prompt"]')).toHaveCount(0);

    await page.locator('[data-testid="service-card"][data-requires-pickup="true"]').first().click();

    await expect(page.locator('#pickup-address-street')).toHaveValue('Rua das Acácias');
    await expect(page.locator('#pickup-address-number')).toHaveValue('45');
    await expect(page.locator('#pickup-address-neighborhood')).toHaveValue('Jardim América');
    await expect(page.locator('#pickup-address-city')).toHaveValue('Belo Horizonte');
    await expect(page.locator('#pickup-address-state')).toHaveValue('MG');
    await expect(page.locator('#pickup-address-zip-code')).toHaveValue('30130-020');

    await page.locator('[data-testid="step-next"]').click();
    await expect(page.locator('[data-testid="day-option"]').first()).toBeVisible();
  });
});
