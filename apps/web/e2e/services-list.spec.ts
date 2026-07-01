import { expect, test } from '@playwright/test';
import { loginAsStaff } from './helpers/auth';
import { createService, deactivateService, makeUniqueServiceName } from './helpers/services';

test.describe('service list behavior', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStaff(page, 'admin@lavacar.com.br', 'lavacar-beloauto');
  });

  test('filters active and inactive services on the list', async ({ page }) => {
    const activeService = await createService(page, {
      name: makeUniqueServiceName('e2e-list-active'),
      description: 'Serviço e2e-list-active',
      priceAmount: 180,
      durationMinutes: 60,
      loyaltyPointsValue: 15,
      requiresPickupAddress: false,
      isActive: true,
    });
    const inactiveService = await createService(page, {
      name: makeUniqueServiceName('e2e-list-inactive'),
      description: 'Serviço e2e-list-inactive',
      priceAmount: 95,
      durationMinutes: 35,
      loyaltyPointsValue: 0,
      requiresPickupAddress: true,
      isActive: true,
    });
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
