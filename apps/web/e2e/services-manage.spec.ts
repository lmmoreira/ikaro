import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { loginAsStaff } from './helpers/auth';
import { createService, makeUniqueServiceName } from './helpers/services';

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
    await loginAsStaff(page, 'admin@lavacar.com.br', 'lavacar-beloauto');
  });

  test('edits an active service and returns to the list with the updated values', async ({
    page,
  }) => {
    const service = await seedEditableService(page);
    const updatedName = `${service.name}-updated`;

    await openEditPage(page, service.serviceId);
    await page.getByTestId('service-name-input').fill(updatedName);
    await page.getByTestId('service-description-input').fill('Serviço atualizado via Playwright');
    await page.getByTestId('service-price-input').fill('210');
    await page.getByTestId('service-duration-input').fill('75');
    await page.getByTestId('service-points-input').fill('12');
    await page.getByTestId('service-pickup-switch').click();

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
