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

async function openCreateService(page: Page): Promise<void> {
  await loginAsStaff(page);
  await page.goto('/dashboard/services/new');
}

async function fillCreateServiceForm(
  page: Page,
  values: {
    readonly name: string;
    readonly description: string;
    readonly price: string;
    readonly duration: string;
    readonly points: string;
    readonly requiresPickup?: boolean;
    readonly active?: boolean;
  },
): Promise<void> {
  await page.getByLabel('Nome do serviço').fill(values.name);
  await page.getByLabel('Descrição').fill(values.description);
  await page.getByLabel('Preço').fill(values.price);
  await page.getByLabel('Duração').fill(values.duration);
  await page.getByLabel('Pontos de fidelidade').fill(values.points);

  if (values.requiresPickup) {
    await page.getByRole('switch', { name: 'Coleta e entrega' }).click();
  }

  if (values.active === false) {
    await page.getByRole('switch', { name: 'Criar como ativo' }).click();
  }
}

test.describe('service creation flows', () => {
  test('creates an active service and shows the success banner on the list', async ({ page }) => {
    const serviceName = makeUniqueServiceName('e2e-active');

    await openCreateService(page);
    await fillCreateServiceForm(page, {
      name: serviceName,
      description: 'Serviço criado via Playwright',
      price: '180',
      duration: '60',
      points: '15',
    });

    await expect(page.locator('header')).toContainText('Ativo');

    await page.getByRole('button', { name: 'Criar serviço' }).click();

    await expect(page.getByRole('status')).toContainText('Serviço criado!');
    await expect(page.getByRole('link', { name: new RegExp(serviceName) })).toBeVisible();
    await expect(page.getByRole('link', { name: new RegExp(serviceName) })).toContainText('Ativo');
  });

  test('creates an inactive service and keeps the inactive badge in sync', async ({ page }) => {
    const serviceName = makeUniqueServiceName('e2e-inactive');

    await openCreateService(page);
    await fillCreateServiceForm(page, {
      name: serviceName,
      description: 'Rascunho de serviço',
      price: '95',
      duration: '35',
      points: '0',
      active: false,
      requiresPickup: true,
    });

    await expect(page.locator('header')).toContainText('Inativo');

    await page.getByRole('button', { name: 'Criar serviço' }).click();

    await expect(page.getByRole('status')).toContainText('Serviço criado!');
    const card = page.getByRole('link', { name: new RegExp(serviceName) });
    await expect(card).toBeVisible();
    await expect(card).toContainText('Inativo');
  });

  test('shows inline validation when required fields are missing', async ({ page }) => {
    await openCreateService(page);

    await page.getByRole('button', { name: 'Criar serviço' }).click();

    await expect(page.getByText('Informe o nome do serviço.')).toBeVisible();
    await expect(page.getByText('Informe o preço do serviço.')).toBeVisible();
    await expect(page.getByText('Informe a duração do serviço.')).toBeVisible();
  });

  test('accepts boundary values at the form limits', async ({ page }) => {
    const serviceName = `BND-${Date.now()}-${Math.random().toString(36).slice(2)}`
      .padEnd(100, 'B')
      .slice(0, 100);
    const description = 'D'.repeat(500);

    await openCreateService(page);
    await fillCreateServiceForm(page, {
      name: serviceName,
      description,
      price: '123.45',
      duration: '1',
      points: '0',
      requiresPickup: true,
    });

    await page.getByRole('button', { name: 'Criar serviço' }).click();

    await expect(page.getByRole('status')).toContainText('Serviço criado!');
    await expect(page.getByRole('link', { name: new RegExp(serviceName) })).toBeVisible();
  });

  test('shows the mobile bottom action bar on small screens', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openCreateService(page);

    await expect(page.getByRole('link', { name: 'Cancelar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Criar serviço' })).toBeVisible();
  });
});
