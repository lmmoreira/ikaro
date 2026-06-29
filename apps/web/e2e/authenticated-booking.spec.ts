import { expect, test, type Page } from '@playwright/test';

const BFF_URL = process.env.PLAYWRIGHT_BFF_URL ?? 'http://localhost:3002/v1';
const WEB_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

if (!INTERNAL_API_KEY) {
  throw new Error('PLAYWRIGHT/INTERNAL_API_KEY is required for dev-login E2E helpers');
}

function uniqueTestEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}@e2e.example.com`;
}

async function loginAsCustomer(page: Page, email: string, tenantSlug: string): Promise<void> {
  const res = await page.request.post(`${BFF_URL}/auth/dev-login`, {
    headers: { 'X-Internal-Key': INTERNAL_API_KEY },
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

async function navigateToAuthenticatedStep3(
  page: Page,
  tenantSlug = 'ikaro',
  requiresPickupAddress = false,
): Promise<void> {
  await loginAsCustomer(page, uniqueTestEmail(`booking-auth-${tenantSlug}`), tenantSlug);
  await completeCustomerProfile(page, tenantSlug);

  await page.goto(`/${tenantSlug}/booking`);
  await page.locator('[data-testid="step-service-selection"]').waitFor();

  await page
    .locator(
      `[data-testid="service-card"][data-requires-pickup="${requiresPickupAddress ? 'true' : 'false'}"]`,
    )
    .first()
    .click();
  await page.locator('[data-testid="step-next"]').click();

  await page.locator('[data-testid="day-option"]:not([disabled])').first().click();
  await page.locator('[data-testid="time-slot"]').first().click();
  await page.locator('[data-testid="step-next"]').click();
}

async function setupAuthenticatedCustomer(page: Page, tenantSlug: string): Promise<void> {
  await loginAsCustomer(page, uniqueTestEmail(`booking-auth-${tenantSlug}`), tenantSlug);
  await completeCustomerProfile(page, tenantSlug);
}

test.describe('UC-002 — Authenticated customer booking golden path', () => {
  test('authenticated customer sees the default pickup address on step 1', async ({ page }) => {
    await setupAuthenticatedCustomer(page, 'lavacar-beloauto');

    await page.goto('/lavacar-beloauto/booking');
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

  test('authenticated customer submits the booking through the authenticated endpoint', async ({
    page,
  }) => {
    let guestBookingCalled = false;
    let authenticatedRequestBody: Record<string, unknown> | null = null;

    await page.route(/\/v1\/bookings$/, (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      guestBookingCalled = true;
      return route.abort();
    });

    await page.route(/\/v1\/bookings\/authenticated$/, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      authenticatedRequestBody = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ bookingId: 'booking-auth-1', status: 'PENDING' }),
      });
    });

    await navigateToAuthenticatedStep3(page, 'ikaro');

    await expect(page.locator('[data-testid="input-name"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="input-email"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="input-phone"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="toggle-contact-address"]')).toHaveCount(0);

    await page.locator('[data-testid="step-next"]').click();
    await expect(page.locator('[data-testid="step-confirm"]')).toBeVisible();

    await page.locator('[data-testid="step-confirm"]').click();

    await expect(page.locator('[data-testid="booking-success"]')).toBeVisible();
    expect(guestBookingCalled).toBe(false);
    expect(authenticatedRequestBody).not.toBeNull();
    expect(typeof authenticatedRequestBody?.scheduledAt).toBe('string');
    expect(Array.isArray(authenticatedRequestBody?.serviceIds)).toBe(true);
    expect(authenticatedRequestBody).not.toHaveProperty('contactName');
    expect(authenticatedRequestBody).not.toHaveProperty('contactEmail');
    expect(authenticatedRequestBody).not.toHaveProperty('contactPhone');
  });
});
