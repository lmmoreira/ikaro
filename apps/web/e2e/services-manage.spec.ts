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
    headers: { 'X-Internal-Key': INTERNAL_API_KEY },
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

async function openEditPage(page: Page, serviceId: string): Promise<void> {
  await page.goto(`/dashboard/services/${serviceId}/edit`);
}

async function seedEditableService(
  page: Page,
  overrides: Partial<{
    readonly name: string;
    readonly description: string;
    readonly priceAmount: number;
    readonly durationMinutes: number;
    readonly loyaltyPointsValue: number;
    readonly requiresPickupAddress: boolean;
    readonly isActive: boolean;
  }> = {},
): Promise<{ readonly serviceId: string; readonly name: string }> {
  const service = await createService(page, {
    name: overrides.name ?? makeUniqueServiceName('e2e-edit'),
    description: overrides.description ?? 'Serviço de teste',
    priceAmount: overrides.priceAmount ?? 180,
    durationMinutes: overrides.durationMinutes ?? 60,
    loyaltyPointsValue: overrides.loyaltyPointsValue ?? 10,
    requiresPickupAddress: overrides.requiresPickupAddress ?? false,
    isActive: overrides.isActive ?? true,
  });

  return {
    serviceId: service.serviceId,
    name: service.name,
  };
}

test.describe('service management flows', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStaff(page);
  });

  test('edits an active service and returns to the list with the updated values', async ({
    page,
  }) => {
    const service = await seedEditableService(page);
    const updatedName = `${service.name}-updated`;

    await openEditPage(page, service.serviceId);
    await page.getByLabel('Nome do serviço').fill(updatedName);
    await page.getByLabel('Descrição').fill('Serviço atualizado via Playwright');
    await page.getByLabel('Preço').fill('210');
    await page.getByLabel('Duração').fill('75');
    await page.getByLabel('Pontos de fidelidade').fill('12');
    await page.getByRole('switch', { name: 'Coleta e entrega' }).click();

    await page.getByRole('button', { name: 'Salvar alterações' }).click();

    await expect(page).toHaveURL('/dashboard/services');
    await expect(page.getByRole('link', { name: new RegExp(updatedName) })).toBeVisible();
    await expect(page.getByRole('link', { name: new RegExp(updatedName) })).toContainText('Ativo');
    await expect(page.getByRole('link', { name: new RegExp(updatedName) })).toContainText(
      '🚗 Coleta',
    );
  });

  test('deactivates an active service and reactivates it from the edit screen', async ({
    page,
  }) => {
    const service = await seedEditableService(page);

    await openEditPage(page, service.serviceId);
    await page.getByRole('link', { name: 'Desativar serviço' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Desativar serviço');

    await page.getByRole('button', { name: 'Confirmar desativação' }).click();

    const serviceCard = page.getByRole('link', { name: new RegExp(service.name) });
    await expect(serviceCard).toBeVisible();
    await expect(serviceCard).toContainText('Inativo');

    await serviceCard.click();
    await expect(page.getByRole('button', { name: 'Ativar serviço' })).toBeVisible();
    await expect(page.locator('header')).toContainText('Inativo');

    await page.getByRole('button', { name: 'Ativar serviço' }).click();
    await expect(page.locator('header')).toContainText('Ativo');

    await page.getByRole('button', { name: 'Salvar alterações' }).click();

    await expect(page).toHaveURL('/dashboard/services');
    await expect(page.getByRole('link', { name: new RegExp(service.name) })).toContainText('Ativo');
  });

  test('shows the not-found page for an invalid service id', async ({ page }) => {
    await page.goto('/dashboard/services/00000000-0000-7000-8003-0000000000ff/edit');

    await expect(page.locator('[data-testid="not-found-heading"]')).toHaveText(
      'Tenant não encontrado',
    );
  });
});
