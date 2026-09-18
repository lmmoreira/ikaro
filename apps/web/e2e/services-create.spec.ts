import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { loginAsStaff } from './helpers/auth';
import { makeUniqueServiceName } from './helpers/services';

async function openCreateService(page: Page): Promise<void> {
  await loginAsStaff(page, 'admin@lavacar.com.br', 'lavacar-beloauto');
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
  await page.getByTestId('service-name-input').fill(values.name);
  await page.getByTestId('service-description-input').fill(values.description);
  await page.getByTestId('service-price-input').fill(values.price);
  await page.getByTestId('service-duration-input').fill(values.duration);
  await page.getByTestId('service-points-input').fill(values.points);

  if (values.requiresPickup) {
    await page.getByTestId('service-pickup-switch').click();
  }

  if (values.active === false) {
    await page.getByTestId('service-active-switch').click();
  }
}

test.describe('service creation flows', () => {
  test('creates an active service and lands on its edit page with the success banner', async ({
    page,
  }) => {
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

    // M22-S04: create now redirects straight to the edit page (Detalhes tab, inline banner),
    // not back to the list.
    await expect(page).toHaveURL(/\/dashboard\/services\/[^/]+\/edit\?created=1$/);
    await expect(page.getByTestId('service-created-banner')).toContainText('Serviço criado!');
    await expect(page.getByTestId('service-name-input')).toHaveValue(serviceName);
    for (const tab of ['Recursos', 'Políticas de reserva', 'Formulário de reserva']) {
      await expect(page.getByRole('tab', { name: tab })).toBeVisible();
    }

    await page.goto('/dashboard/services');
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

    await expect(page).toHaveURL(/\/dashboard\/services\/[^/]+\/edit\?created=1$/);
    await expect(page.getByTestId('service-created-banner')).toContainText('Serviço criado!');

    await page.goto('/dashboard/services');
    const card = page.getByRole('link', { name: new RegExp(serviceName) });
    await expect(card).toBeVisible();
    await expect(card).toContainText('Inativo');
  });

  test('shows inline validation when required fields are missing', async ({ page }) => {
    await openCreateService(page);

    await page.getByRole('button', { name: 'Criar serviço' }).click();

    await expect(page.getByTestId('service-name-error')).toBeVisible();
    await expect(page.getByTestId('service-price-error')).toBeVisible();
    await expect(page.getByTestId('service-duration-error')).toBeVisible();
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

    await expect(page).toHaveURL(/\/dashboard\/services\/[^/]+\/edit\?created=1$/);
    await expect(page.getByTestId('service-created-banner')).toContainText('Serviço criado!');

    await page.goto('/dashboard/services');
    await expect(page.getByRole('link', { name: new RegExp(serviceName) })).toBeVisible();
  });

  test('shows the mobile bottom action bar on small screens', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openCreateService(page);

    await expect(page.getByRole('link', { name: 'Cancelar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Criar serviço' })).toBeVisible();
  });

  test('picks the Turma (SESSION) booking model and persists it (UC-056)', async ({ page }) => {
    const serviceName = makeUniqueServiceName('e2e-turma');

    await openCreateService(page);
    await page.getByTestId('booking-model-session').click();
    // SESSION services have no per-reservation pickup/delivery concept — toggle must disappear.
    await expect(page.getByTestId('service-pickup-switch')).toHaveCount(0);

    await fillCreateServiceForm(page, {
      name: serviceName,
      description: 'Turma criada via Playwright',
      price: '90',
      duration: '120',
      points: '0',
    });
    await page.getByRole('button', { name: 'Criar serviço' }).click();

    await expect(page).toHaveURL(/\/dashboard\/services\/[^/]+\/edit\?created=1$/);

    await page.goto('/dashboard/services');
    const card = page.getByRole('link', { name: new RegExp(serviceName) });
    await expect(card).toBeVisible();
    await expect(card).toContainText('Turma');
  });
});
