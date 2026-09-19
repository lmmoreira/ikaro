import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { loginAsStaff } from './helpers/auth';
import { createService, deactivateService, makeUniqueServiceName } from './helpers/services';
import { createResource, deactivateResource } from './helpers/booking/resource-api';
import { BFF_URL, WEB_INTERNAL_KEY } from './helpers/auth/shared';

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
    await page.getByTestId('service-desktop-tab-action').click();
    await expect(page.getByTestId('resource-requirements-saved')).toBeVisible();

    await page.reload();
    await page.getByRole('tab', { name: 'Recursos' }).click();
    await expect(resourceTypeCheckbox(page, 'ROOM')).toBeChecked();
    await expect(resourceTypeCheckbox(page, 'EQUIPMENT')).toBeChecked();
  });

  test('switches a service to legs, adds 2 legs, sees the computed total span', async ({
    page,
  }) => {
    await createResource(page, { type: 'ROOM', name: makeUniqueServiceName('e2e-room') });
    const service = await seedService(page);

    await openEditPage(page, service.serviceId);
    await page.getByRole('tab', { name: 'Recursos' }).click();
    await page.getByTestId('resource-mode-legs').click();

    // Buffer stays visible but visibly disabled once legs mode is selected (not removed) —
    // legged services use per-leg transitionGapAfterMinutes instead of a single buffer.
    await expect(page.getByTestId('resource-buffer-input')).toBeDisabled();

    await page.getByTestId('legs-add-button').click();
    await page.getByTestId('legs-add-button').click();

    // Every leg needs a name and at least one resource type selected (ServiceLeg.create()'s own
    // domain invariant — name-required / requires-resource-requirement).
    const firstLegName = page.locator('[data-testid="leg-name"][data-leg-index="0"]');
    const secondLegName = page.locator('[data-testid="leg-name"][data-leg-index="1"]');
    await firstLegName.fill('Etapa 1');
    await secondLegName.fill('Etapa 2');

    const firstLegDuration = page.locator('[data-testid="leg-duration"][data-leg-index="0"]');
    const secondLegDuration = page.locator('[data-testid="leg-duration"][data-leg-index="1"]');
    await firstLegDuration.fill('20');
    await secondLegDuration.fill('50');

    await page
      .locator(
        '[data-testid="resource-type-checkbox"][data-scope="leg-0"][data-resource-type="ROOM"]',
      )
      .click();
    await page
      .locator(
        '[data-testid="resource-type-checkbox"][data-scope="leg-1"][data-resource-type="ROOM"]',
      )
      .click();

    await expect(page.getByTestId('legs-total-span')).toContainText('70');

    await page.getByTestId('service-desktop-tab-action').click();
    await expect(page.getByTestId('resource-requirements-saved')).toBeVisible();
  });

  test('changes a booking-policy field, saves, reloads, sees it persisted', async ({ page }) => {
    const service = await seedService(page);

    await openEditPage(page, service.serviceId);
    await page.getByRole('tab', { name: 'Políticas de reserva' }).click();

    const recurrenceToggle = page.getByTestId('policy-recurrence-eligible');
    await expect(recurrenceToggle).not.toBeChecked();
    await recurrenceToggle.click();
    await page.getByTestId('service-desktop-tab-action').click();
    await expect(page.getByTestId('policy-saved')).toBeVisible();

    await page.reload();
    await page.getByRole('tab', { name: 'Políticas de reserva' }).click();
    await expect(page.getByTestId('policy-recurrence-eligible')).toBeChecked();
  });

  test('sets a variable-duration per-increment policy, then switches back to FIXED and saves again', async ({
    page,
  }) => {
    const service = await seedService(page);

    await openEditPage(page, service.serviceId);
    await page.getByRole('tab', { name: 'Políticas de reserva' }).click();

    await page.getByTestId('policy-duration-policy').selectOption('CUSTOMER_SELECTED');
    await page.getByTestId('policy-duration-min').fill('30');
    await page.getByTestId('policy-duration-max').fill('90');
    await page.getByTestId('policy-duration-increment').fill('15');
    await page.getByTestId('policy-pricing-policy').selectOption('PER_TIME_INCREMENT');
    await page.getByTestId('policy-pricing-increment').fill('15');
    await page.getByTestId('policy-price-per-increment').fill('10');
    await page.getByTestId('service-desktop-tab-action').click();
    await expect(page.getByTestId('policy-saved')).toBeVisible();

    // The backend rejects pricingPolicy=PER_TIME_INCREMENT once durationPolicy is FIXED again —
    // switching duration back must force pricing back to FIXED too, or this save 422s.
    await page.getByTestId('policy-duration-policy').selectOption('FIXED');
    await page.getByTestId('service-desktop-tab-action').click();
    await expect(page.getByTestId('policy-saved')).toBeVisible();
    await expect(page.getByTestId('policy-error')).not.toBeVisible();
  });

  test('publishes a new intake-schema version and sees the previous version in history', async ({
    page,
  }) => {
    const service = await seedService(page);

    await openEditPage(page, service.serviceId);
    await page.getByRole('tab', { name: 'Formulário de reserva' }).click();

    await page.getByTestId('intake-add-question').click();
    // An in-progress, unpublished question marks the Formulário tab dirty like every other tab.
    await expect(
      page.locator('[data-testid="service-edit-tab-dirty-dot"][data-tab="formulario"]'),
    ).toBeVisible();

    await page.getByTestId('intake-consent-text').fill('Concordo com os termos');
    // A blank question label keeps Publish disabled — the request schema requires label.min(1),
    // so the client-side gate must catch this before it ever reaches the server.
    await expect(page.getByTestId('service-desktop-tab-action')).toBeDisabled();

    await page
      .locator('[data-testid="intake-question-label"][data-question-index="0"]')
      .fill('Necessidades de acesso');
    await expect(page.getByTestId('service-desktop-tab-action')).toBeEnabled();
    await page.getByTestId('service-desktop-tab-action').click();
    await expect(page.getByTestId('intake-published')).toBeVisible();
    await expect(page.getByTestId('intake-version-current')).toContainText('1');
    // Publishing clears the tab's dirty flag, same as every other tab's save.
    await expect(
      page.locator('[data-testid="service-edit-tab-dirty-dot"][data-tab="formulario"]'),
    ).toHaveCount(0);

    await page.getByTestId('intake-add-question').click();
    await page
      .locator('[data-testid="intake-question-label"][data-question-index="1"]')
      .fill('Segunda pergunta');
    await page.getByTestId('service-desktop-tab-action').click();
    await expect(page.getByTestId('intake-published')).toBeVisible();
    await expect(page.getByTestId('intake-version-current')).toContainText('2');

    const historyRow = page.locator('[data-testid="intake-version-history-row"][data-version="1"]');
    await expect(historyRow).toBeVisible();
    await historyRow.click();
    await expect(page.getByTestId('intake-version-modal')).toBeVisible();
  });

  test('edits Recursos, switches to Políticas without saving, then navigating away opens the discard dialog', async ({
    page,
  }) => {
    const service = await seedService(page);

    await openEditPage(page, service.serviceId);
    await page.getByRole('tab', { name: 'Recursos' }).click();
    await resourceTypeCheckbox(page, 'ROOM').click();

    await page.getByRole('tab', { name: 'Políticas de reserva' }).click();

    await page.getByRole('link', { name: 'Cancelar' }).first().click();
    await expect(page.getByTestId('service-discard-confirm')).toBeVisible();
    await page.getByRole('button', { name: 'Continuar editando' }).click();
    await expect(page.getByTestId('service-discard-confirm')).toBeHidden();
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

  test('creates a service and configures all four tabs from the sticky action panel, then sees everything persisted after reload', async ({
    page,
  }) => {
    await createResource(page, { type: 'ROOM', name: makeUniqueServiceName('e2e-room') });
    const serviceName = makeUniqueServiceName('e2e-journey');

    await page.goto('/dashboard/services/new');
    await page.getByTestId('service-name-input').fill(serviceName);
    await page.getByTestId('service-description-input').fill('Descrição inicial');
    await page.getByTestId('service-price-input').fill('120');
    await page.getByTestId('service-duration-input').fill('45');
    await page.getByTestId('service-points-input').fill('5');
    await page.getByRole('button', { name: 'Criar serviço' }).click();
    await expect(page).toHaveURL(/\/dashboard\/services\/[^/]+\/edit\?created=1$/);

    const tabAction = page.getByTestId('service-desktop-tab-action');
    const dirtyDot = (tab: string) =>
      page.locator(`[data-testid="service-edit-tab-dirty-dot"][data-tab="${tab}"]`);

    // Detalhes — its own Save lives in the same sticky panel; no per-tab action there.
    await page.getByTestId('service-description-input').fill('Descrição atualizada');
    await expect(dirtyDot('detalhes')).toBeVisible();
    await page.getByTestId('service-desktop-save-button').click();
    await expect(dirtyDot('detalhes')).toHaveCount(0);
    await expect(tabAction).toHaveCount(0);

    // Recursos
    await page.getByRole('tab', { name: 'Recursos' }).click();
    await expect(tabAction).toHaveText('Salvar recursos');
    await resourceTypeCheckbox(page, 'ROOM').click();
    await tabAction.click();
    await expect(page.getByTestId('resource-requirements-saved')).toBeVisible();

    // Políticas de reserva
    await page.getByRole('tab', { name: 'Políticas de reserva' }).click();
    await expect(tabAction).toHaveText('Salvar políticas');
    await page.getByTestId('policy-recurrence-eligible').click();
    await tabAction.click();
    await expect(page.getByTestId('policy-saved')).toBeVisible();

    // Formulário de reserva — Publish is disabled until the form is valid.
    await page.getByRole('tab', { name: 'Formulário de reserva' }).click();
    await expect(tabAction).toHaveText('Publicar formulário');
    await expect(tabAction).toBeDisabled();
    await page.getByTestId('intake-add-question').click();
    await page
      .locator('[data-testid="intake-question-label"][data-question-index="0"]')
      .fill('Possui alguma alergia?');
    await page
      .locator('[data-testid="intake-question-type"][data-question-index="0"]')
      .selectOption('BOOLEAN');
    await page.getByTestId('intake-consent-text').fill('Concordo com os termos');
    await expect(tabAction).toBeEnabled();
    await tabAction.click();
    await expect(page.getByTestId('intake-published')).toBeVisible();

    for (const tab of ['detalhes', 'recursos', 'politicas', 'formulario']) {
      await expect(dirtyDot(tab)).toHaveCount(0);
    }

    await page.reload();
    await expect(page.getByTestId('service-description-input')).toHaveValue('Descrição atualizada');
    await page.getByRole('tab', { name: 'Recursos' }).click();
    await expect(resourceTypeCheckbox(page, 'ROOM')).toBeChecked();
    await page.getByRole('tab', { name: 'Políticas de reserva' }).click();
    await expect(page.getByTestId('policy-recurrence-eligible')).toBeChecked();
    await page.getByRole('tab', { name: 'Formulário de reserva' }).click();
    await expect(page.getByTestId('intake-version-current')).toContainText('1');
  });

  test('blocks a required quantity above the eligible resources inline and on the API, and saves once it fits', async ({
    page,
  }) => {
    await createResource(page, { type: 'ROOM', name: makeUniqueServiceName('e2e-room-a') });
    await createResource(page, { type: 'ROOM', name: makeUniqueServiceName('e2e-room-b') });
    const service = await seedService(page);

    await openEditPage(page, service.serviceId);
    await page.getByRole('tab', { name: 'Recursos' }).click();
    await resourceTypeCheckbox(page, 'ROOM').click();

    const row = page.locator(
      '[data-testid="resource-type-fields"][data-scope="flat"][data-resource-type="ROOM"]',
    );
    const addEligible = row.getByTestId('resource-type-add-eligible');
    const quantityError = row.getByTestId('resource-type-quantity-error');
    const tabAction = page.getByTestId('service-desktop-tab-action');

    // One explicit eligible resource but two required → impossible to book.
    await addEligible.selectOption({ index: 1 });
    await row.getByTestId('resource-type-quantity').fill('2');
    await expect(quantityError).toBeVisible();
    await expect(tabAction).toBeDisabled();

    // The API refuses the same shape (the UI guard is not the only line of defence).
    const pool = await page.request.get(`${BFF_URL}/resources?isActive=true&type=ROOM`, {
      headers: { 'X-Web-Internal-Key': WEB_INTERNAL_KEY! },
    });
    const rooms = ((await pool.json()) as { items: { id: string }[] }).items;
    const rejected = await page.request.patch(
      `${BFF_URL}/services/${service.serviceId}/resource-requirements`,
      {
        data: {
          resourceRequirements: [
            {
              type: 'ROOM',
              selectionMode: 'AUTO_FUNGIBLE_POOL',
              resourcePoolIds: [rooms[0]!.id],
              requiredQuantity: 2,
            },
          ],
        },
        headers: { 'X-Web-Internal-Key': WEB_INTERNAL_KEY! },
      },
    );
    expect(rejected.status()).toBe(422);

    // Adding a second eligible resource makes the quantity satisfiable again.
    await addEligible.selectOption({ index: 1 });
    await expect(quantityError).toHaveCount(0);
    await expect(tabAction).toBeEnabled();
    await tabAction.click();
    await expect(page.getByTestId('resource-requirements-saved')).toBeVisible();
  });

  test('blocks the save when every saved eligible resource has been deactivated, and unblocks it once a new one is picked', async ({
    page,
  }) => {
    const roomA = await createResource(page, {
      type: 'ROOM',
      name: makeUniqueServiceName('e2e-room-stale'),
    });
    const roomB = await createResource(page, {
      type: 'ROOM',
      name: makeUniqueServiceName('e2e-room-fresh'),
    });
    const service = await seedService(page);
    const saved = await page.request.patch(
      `${BFF_URL}/services/${service.serviceId}/resource-requirements`,
      {
        data: {
          resourceRequirements: [
            {
              type: 'ROOM',
              selectionMode: 'CUSTOMER_CHOICE',
              resourcePoolIds: [roomA.id],
              requiredQuantity: 1,
            },
          ],
        },
        headers: { 'X-Web-Internal-Key': WEB_INTERNAL_KEY! },
      },
    );
    expect(saved.ok()).toBe(true);
    await deactivateResource(page, roomA.id);

    await openEditPage(page, service.serviceId);
    await page.getByRole('tab', { name: 'Recursos' }).click();

    const row = page.locator(
      '[data-testid="resource-type-fields"][data-scope="flat"][data-resource-type="ROOM"]',
    );
    const tabAction = page.getByTestId('service-desktop-tab-action');

    // Saving would strip the dead id and send [] — which the backend reads as "any room".
    await expect(row.getByTestId('resource-type-stale-pool')).toBeVisible();
    await expect(tabAction).toBeDisabled();

    await row.getByTestId('resource-type-add-eligible').selectOption(roomB.id);
    await expect(row.getByTestId('resource-type-stale-pool')).toHaveCount(0);
    await expect(tabAction).toBeEnabled();
    await tabAction.click();
    await expect(page.getByTestId('resource-requirements-saved')).toBeVisible();
  });

  test('discarding unsaved changes: the dialog can be kept-editing, confirmed via Cancelar, and opened from the topbar back button', async ({
    page,
  }) => {
    const service = await seedService(page);
    await openEditPage(page, service.serviceId);
    const discardConfirm = page.getByTestId('service-discard-confirm');
    // Before hydration the topbar back control is a plain link; the guarded <button> only exists
    // once ServiceEditPage has registered its onBackOverride — wait for that variant, or a click
    // landing during the swap is lost.
    const guardedBack = page.locator('button[data-testid="topbar-back-button"]');

    // Nothing dirty → leaving is immediate, no dialog.
    await guardedBack.click();
    await expect(page).toHaveURL(/\/dashboard\/services$/);

    await openEditPage(page, service.serviceId);
    await expect(guardedBack).toBeVisible();
    await page.getByTestId('service-name-input').fill(`${service.name}-alterado`);

    // Topbar back arrow opens the same in-app dialog; "Continuar editando" keeps the edit.
    await guardedBack.click();
    await expect(discardConfirm).toBeVisible();
    await page.getByRole('button', { name: 'Continuar editando' }).click();
    await expect(discardConfirm).toBeHidden();
    await expect(page.getByTestId('service-name-input')).toHaveValue(`${service.name}-alterado`);

    // Cancelar → "Descartar alterações" really leaves, without saving.
    await page.getByTestId('service-cancel-desktop-link').click();
    await expect(discardConfirm).toBeVisible();
    await discardConfirm.click();
    await expect(page).toHaveURL(/\/dashboard\/services$/);

    await openEditPage(page, service.serviceId);
    await expect(page.getByTestId('service-name-input')).toHaveValue(service.name);
  });

  test('on a narrow screen the mobile bar carries the active tab action and the tab bar never scrolls vertically', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const service = await seedService(page);
    await openEditPage(page, service.serviceId);

    const tablist = page.getByRole('tablist');
    const overflow = await tablist.evaluate((element) => ({
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      overflowY: getComputedStyle(element).overflowY,
    }));
    expect(overflow.overflowY).toBe('hidden');
    expect(overflow.scrollHeight).toBeLessThanOrEqual(overflow.clientHeight);

    await page.getByRole('tab', { name: 'Políticas de reserva' }).click();
    await expect(page.getByTestId('service-mobile-tab-action')).toHaveText('Salvar políticas');
    await page.getByTestId('policy-recurrence-eligible').click();
    await page.getByTestId('service-mobile-tab-action').click();
    await expect(page.getByTestId('policy-saved')).toBeVisible();
  });
});
