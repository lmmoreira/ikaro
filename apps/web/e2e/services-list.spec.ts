import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

const TENANT_SLUG = 'lavacar-beloauto';
const STAFF_EMAIL = 'admin@lavacar.com.br';
const BFF_URL = process.env.PLAYWRIGHT_BFF_URL ?? 'http://127.0.0.1:3002/v1';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

if (!INTERNAL_API_KEY) {
  throw new Error('PLAYWRIGHT/INTERNAL_API_KEY is required for service e2e tests');
}

function makeUniqueServiceName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function loginAsStaff(page: Page): Promise<void> {
  const res = await page.request.post(`${BFF_URL}/auth/dev-login`, {
    headers: { 'X-Internal-Key': INTERNAL_API_KEY! },
    data: { email: STAFF_EMAIL, tenantSlug: TENANT_SLUG, type: 'staff' },
  });

  if (!res.ok()) {
    throw new Error(`dev-login failed: ${res.status()} ${await res.text()}`);
  }

  const body = (await res.json()) as { readonly accessToken: string };
  await page.context().addCookies([
    {
      name: 'access_token',
      value: body.accessToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
    {
      name: 'access_token',
      value: body.accessToken,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

async function createService(
  page: Page,
  body: {
    readonly name: string;
    readonly description: string;
    readonly priceAmount: number;
    readonly durationMinutes: number;
    readonly loyaltyPointsValue: number;
    readonly requiresPickupAddress: boolean;
    readonly isActive: boolean;
  },
): Promise<{ readonly serviceId: string; readonly name: string }> {
  const res = await page.request.post(`${BFF_URL}/services`, { data: body });

  if (!res.ok()) {
    throw new Error(`create service failed: ${res.status()} ${await res.text()}`);
  }

  return (await res.json()) as { readonly serviceId: string; readonly name: string };
}

async function deactivateService(page: Page, serviceId: string): Promise<void> {
  const res = await page.request.delete(`${BFF_URL}/services/${serviceId}`);
  if (!res.ok() && res.status() !== 204) {
    throw new Error(`deactivate service failed: ${res.status()} ${await res.text()}`);
  }
}

async function seedService(
  page: Page,
  isActive: boolean,
  prefix: string,
): Promise<{ readonly serviceId: string; readonly name: string }> {
  const service = await createService(page, {
    name: makeUniqueServiceName(prefix),
    description: `Serviço ${prefix}`,
    priceAmount: isActive ? 180 : 95,
    durationMinutes: isActive ? 60 : 35,
    loyaltyPointsValue: isActive ? 15 : 0,
    requiresPickupAddress: !isActive,
    isActive,
  });

  return {
    serviceId: service.serviceId,
    name: service.name,
  };
}

test.describe('service list behavior', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStaff(page);
  });

  test('filters active and inactive services on the list', async ({ page }) => {
    const activeService = await seedService(page, true, 'e2e-list-active');
    const inactiveService = await seedService(page, true, 'e2e-list-inactive');
    await deactivateService(page, inactiveService.serviceId);

    await page.goto('/dashboard/services');

    const activeCard = page.getByRole('link', { name: new RegExp(activeService.name) });
    const inactiveCard = page.getByRole('link', { name: new RegExp(inactiveService.name) });

    await expect(activeCard).toBeVisible();
    await expect(inactiveCard).toBeVisible();

    await page.getByRole('button', { name: /Ativos/ }).click();
    await expect(activeCard).toBeVisible();
    await expect(inactiveCard).toHaveCount(0);

    await page.getByRole('button', { name: /Inativos/ }).click();
    await expect(inactiveCard).toBeVisible();
    await expect(activeCard).toHaveCount(0);
  });
});
