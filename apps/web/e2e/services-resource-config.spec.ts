import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { loginAsStaff } from './helpers/auth';
import { createService, deactivateService, makeUniqueServiceName } from './helpers/services';
import { createResource } from './helpers/booking/resource-api';

// M22-S04 — Manager "Serviços" resource-config extension: Recursos/Políticas de reserva/
// Formulário de reserva tabs, plus the unsaved-changes guard and the inactive-service tab set.

async function openEditPage(page: Page, serviceId: string): Promise<void> {
  await page.goto(`/dashboard/services/${serviceId}/edit`);
}

async function seedService(
  page: Page,
  overrides: Partial<{ readonly name: string; readonly isActive: boolean }> = {},
): Promise<{ readonly serviceId: string; readonly name: string }> {
  const service = await createService(page, {
    name: overrides.name ?? makeUniqueServiceName('e2e-recursos'),
    description: 'Serviço de teste M22-S04',
    priceAmount: 150,
    durationMinutes: 60,
    loyaltyPointsValue: 10,
    requiresPickupAddress: false,
    isActive: overrides.isActive ?? true,
  });
  return { serviceId: service.serviceId, name: service.name };
}

function resourceTypeCheckbox(page: Page, type: 'STAFF' | 'ROOM' | 'EQUIPMENT') {
  return page.locator(
    `[data-testid="resource-type-checkbox"][data-scope="flat"][data-resource-type="${type}"]`,
  );
}

test.describe('M22-S04 — Serviços resource-config tabs', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStaff(page, 'admin@lavacar.com.br', 'lavacar-beloauto');
  });

  test('configures a bundled resource requirement, saves, reloads, sees it persisted', async ({
    page,
  }) => {
    await createResource(page, { type: 'ROOM', name: makeUniqueServiceName('e2e-room') });
    await createResource(page, { type: 'EQUIPMENT', name: makeUniqueServiceName('e2e-equip') });
    const service = await seedService(page);

    await openEditPage(page, service.serviceId);
    await page.getByRole('tab', { name: 'Recursos' }).click();

    await resourceTypeCheckbox(page, 'ROOM').click();
    await resourceTypeCheckbox(page, 'EQUIPMENT').click();
    await page.getByTestId('resource-requirements-save').click();
    await expect(page.getByTestId('resource-requirements-saved')).toBeVisible();

    await page.reload();
    await page.getByRole('tab', { name: 'Recursos' }).click();
    await expect(resourceTypeCheckbox(page, 'ROOM')).toBeChecked();
    await expect(resourceTypeCheckbox(page, 'EQUIPMENT')).toBeChecked();
  });

  test('switches a service to legs, adds 2 legs, sees the computed total span', async ({
    page,
  }) => {
    const service = await seedService(page);

    await openEditPage(page, service.serviceId);
    await page.getByRole('tab', { name: 'Recursos' }).click();
    await page.getByTestId('resource-mode-legs').click();

    await page.getByTestId('legs-add-button').click();
    await page.getByTestId('legs-add-button').click();

    const firstLegDuration = page.locator('[data-testid="leg-duration"][data-leg-index="0"]');
    const secondLegDuration = page.locator('[data-testid="leg-duration"][data-leg-index="1"]');
    await firstLegDuration.fill('20');
    await secondLegDuration.fill('50');

    await expect(page.getByTestId('legs-total-span')).toContainText('70');

    await page.getByTestId('resource-requirements-save').click();
    await expect(page.getByTestId('resource-requirements-saved')).toBeVisible();
  });

  test('publishes a new intake-schema version and sees the previous version in history', async ({
    page,
  }) => {
    const service = await seedService(page);

    await openEditPage(page, service.serviceId);
    await page.getByRole('tab', { name: 'Formulário de reserva' }).click();

    await page.getByTestId('intake-add-question').click();
    await page
      .locator('[data-testid="intake-question-label"][data-question-index="0"]')
      .fill('Necessidades de acesso');
    await page.getByTestId('intake-consent-text').fill('Concordo com os termos');
    await page.getByTestId('intake-publish').click();
    await expect(page.getByTestId('intake-published')).toBeVisible();
    await expect(page.getByTestId('intake-version-current')).toContainText('1');

    await page.getByTestId('intake-add-question').click();
    await page
      .locator('[data-testid="intake-question-label"][data-question-index="1"]')
      .fill('Segunda pergunta');
    await page.getByTestId('intake-publish').click();
    await expect(page.getByTestId('intake-published')).toBeVisible();
    await expect(page.getByTestId('intake-version-current')).toContainText('2');

    const historyRow = page.locator('[data-testid="intake-version-history-row"][data-version="1"]');
    await expect(historyRow).toBeVisible();
    await historyRow.click();
    await expect(page.getByTestId('intake-version-modal')).toBeVisible();
  });

  test('edits Recursos, switches to Políticas without saving, then navigating away prompts a confirmation', async ({
    page,
  }) => {
    const service = await seedService(page);

    await openEditPage(page, service.serviceId);
    await page.getByRole('tab', { name: 'Recursos' }).click();
    await resourceTypeCheckbox(page, 'ROOM').click();

    await page.getByRole('tab', { name: 'Políticas de reserva' }).click();

    let dialogSeen = false;
    page.once('dialog', async (dialog) => {
      dialogSeen = true;
      await dialog.dismiss();
    });
    await page.getByRole('link', { name: 'Cancelar' }).first().click();
    await expect.poll(() => dialogSeen).toBe(true);
  });

  test('opens an inactive service and sees all 4 tabs, not just Detalhes', async ({ page }) => {
    const service = await seedService(page);
    await deactivateService(page, service.serviceId);

    await openEditPage(page, service.serviceId);

    await expect(page.getByRole('tab', { name: 'Detalhes' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Recursos' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Políticas de reserva' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Formulário de reserva' })).toBeVisible();
  });
});
