import { expect, test } from '@playwright/test';
import { loginAsStaff, uniqueTestEmail } from './helpers/auth';
import { inviteStaff } from './helpers/staff';
import { getResourceRow } from './helpers/booking';

test.describe('manager resource management flow', () => {
  test('creates a STAFF resource, edits it, deactivates it, reactivates it', async ({ page }) => {
    // inviteStaff needs an authenticated MANAGER session on page.request (the tenant is derived
    // from the caller's own JWT, not a body param) — login must happen first.
    await loginAsStaff(page, 'admin@lavacar.com.br', 'lavacar-beloauto');

    const staff = await inviteStaff(page, {
      email: uniqueTestEmail('e2e-resource'),
      firstName: 'Recurso',
      lastName: 'Teste',
      role: 'STAFF',
    });

    await page.goto('/dashboard/resources/new');
    await page.locator('[data-testid="resource-identity-type-option"][data-type="STAFF"]').click();
    await page.getByTestId('resource-identity-staff-select').selectOption(staff.staffId);
    await page.getByTestId('resource-create-save-desktop').click();

    await expect(page).toHaveURL('/dashboard/resources');
    const row = getResourceRow(page, 'Recurso Teste');
    await expect(row).toBeVisible();
    await expect(row).toContainText('Ativo');

    // Edit — the row's own overlay link is the only way into the edit screen (UC-046); no
    // dedicated "Editar" button exists, matching the prototype's row-is-the-link design.
    await row.getByTestId('resource-row-edit-link').click();
    await expect(page).toHaveURL(/\/dashboard\/resources\/[^/]+$/);
    const nameInput = page.getByTestId('resource-identity-name-input');
    await nameInput.fill('Recurso Editado');
    await page.getByTestId('resource-edit-save-desktop').click();

    await expect(page).toHaveURL('/dashboard/resources');
    const editedRow = getResourceRow(page, 'Recurso Editado');
    await expect(editedRow).toBeVisible();
    await expect(editedRow).toContainText('Ativo');

    await editedRow.getByTestId('resource-row-deactivate-link').click();
    await expect(page).toHaveURL(/\/dashboard\/resources\/.+\/deactivate/);
    await page.getByTestId('resource-deactivate-confirm-desktop').click();

    await expect(page).toHaveURL('/dashboard/resources');
    const inactiveRow = getResourceRow(page, 'Recurso Editado');
    await expect(inactiveRow).toContainText('Inativo');

    // Reactivation is a one-click row action, no navigation — mirrors TeamListPage's own
    // established precedent (reactivate has no dedicated confirmation screen).
    await inactiveRow.getByTestId('resource-row-reactivate-button').click();
    await expect(page).toHaveURL('/dashboard/resources');

    const reactivatedRow = getResourceRow(page, 'Recurso Editado');
    await expect(reactivatedRow).toContainText('Ativo');
  });

  test('creates a ROOM and an EQUIPMENT resource and sees both in the list', async ({ page }) => {
    await loginAsStaff(page, 'admin@lavacar.com.br', 'lavacar-beloauto');

    await page.goto('/dashboard/resources/new');
    await page.locator('[data-testid="resource-identity-type-option"][data-type="ROOM"]').click();
    await page.getByTestId('resource-identity-name-input').fill('Sala Teste E2E');
    await page.getByTestId('resource-create-save-desktop').click();

    await expect(page).toHaveURL('/dashboard/resources');
    const roomRow = getResourceRow(page, 'Sala Teste E2E');
    await expect(roomRow).toBeVisible();
    await expect(roomRow).toContainText('Ativo');

    await page.goto('/dashboard/resources/new');
    await page
      .locator('[data-testid="resource-identity-type-option"][data-type="EQUIPMENT"]')
      .click();
    await page.getByTestId('resource-identity-name-input').fill('Equipamento Teste E2E');
    await page.getByTestId('resource-create-save-desktop').click();

    await expect(page).toHaveURL('/dashboard/resources');
    const equipmentRow = getResourceRow(page, 'Equipamento Teste E2E');
    await expect(equipmentRow).toBeVisible();
    await expect(equipmentRow).toContainText('Ativo');
  });

  test('the LOCATION resource never offers Desativar and its working-hours editor is locked to inherit', async ({
    page,
  }) => {
    await loginAsStaff(page, 'admin@lavacar.com.br', 'lavacar-beloauto');

    await page.goto('/dashboard/resources');
    // M21-S02 backfills exactly one LOCATION resource per tenant, named "Localização Principal"
    // for a pt-BR tenant (apps/backend/src/shared/database/seed.ts's seedResources()) — a
    // pre-existing row, not created by this test.
    const locationRow = getResourceRow(page, 'Localização Principal');
    await expect(locationRow).toBeVisible();
    await expect(locationRow.getByTestId('resource-row-deactivate-link')).not.toBeVisible();

    await locationRow.getByTestId('resource-row-edit-link').click();
    await expect(page).toHaveURL(/\/dashboard\/resources\/[^/]+$/);

    // The working-hours editor is locked (no customize toggle) — a LOCATION resource always
    // inherits the tenant's own business hours (backend enforces this too, 409 Conflict:
    // ResourceLocationWorkingHoursImmutableError).
    await expect(page.getByTestId('resource-hours-locked')).toBeVisible();
    await expect(page.getByTestId('resource-hours-inherit-toggle')).not.toBeVisible();
  });
});

test.describe('resource management access control', () => {
  test('STAFF does not see "Recursos" in the sidebar and is redirected off the route directly', async ({
    page,
  }) => {
    await loginAsStaff(page, 'funcionario@lavacar.com.br', 'lavacar-beloauto');

    await page.goto('/dashboard/bookings');
    await expect(page.getByTestId('sidebar-nav-resources')).not.toBeVisible();

    // Manager-only route — proxy.ts redirects STAFF back to /dashboard before the page ever
    // renders, matching every other manager-only section (Equipe/Configurações/Hotsite).
    // /dashboard itself then redirects to /dashboard/bookings (app/dashboard/page.tsx) — the
    // real final landing page after the double redirect.
    await page.goto('/dashboard/resources');
    await expect(page).toHaveURL('/dashboard/bookings');
  });
});
