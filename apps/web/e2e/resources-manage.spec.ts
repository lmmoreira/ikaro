import { expect, test } from '@playwright/test';
import { loginAsStaff, uniqueTestEmail } from './helpers/auth';
import { inviteStaff } from './helpers/staff';
import { getResourceRow } from './helpers/booking';

test.describe('manager resource management flow', () => {
  test('creates a STAFF resource, sees it in the list, deactivates it, reactivates it', async ({
    page,
  }) => {
    const staff = await inviteStaff(page, {
      email: uniqueTestEmail('e2e-resource'),
      firstName: 'Recurso',
      lastName: 'Teste',
      role: 'STAFF',
    });

    await loginAsStaff(page, 'admin@lavacar.com.br', 'lavacar-beloauto');

    await page.goto('/dashboard/resources/new');
    await page.locator('[data-testid="resource-identity-type-option"][data-type="STAFF"]').click();
    await page.getByTestId('resource-identity-staff-select').selectOption(staff.staffId);
    await page.getByTestId('resource-create-save-desktop').click();

    await expect(page).toHaveURL('/dashboard/resources');
    const row = getResourceRow(page, 'Recurso Teste');
    await expect(row).toBeVisible();
    await expect(row).toContainText('Ativo');

    await row.getByRole('link', { name: 'Desativar' }).click();
    await expect(page).toHaveURL(/\/dashboard\/resources\/.+\/deactivate/);
    await page.getByRole('button', { name: 'Confirmar desativação' }).first().click();

    await expect(page).toHaveURL('/dashboard/resources');
    const inactiveRow = getResourceRow(page, 'Recurso Teste');
    await expect(inactiveRow).toContainText('Inativo');

    await inactiveRow.getByRole('link', { name: 'Reativar' }).click();
    await expect(page).toHaveURL(/\/dashboard\/resources\/.+\/deactivate/);
    await page.getByRole('button', { name: 'Confirmar reativação' }).click();

    await expect(page).toHaveURL('/dashboard/resources');
    const reactivatedRow = getResourceRow(page, 'Recurso Teste');
    await expect(reactivatedRow).toContainText('Ativo');
  });
});

test.describe('resource management access control', () => {
  test('STAFF does not see "Recursos" in the sidebar and is redirected off the route directly', async ({
    page,
  }) => {
    await loginAsStaff(page, 'funcionario@lavacar.com.br', 'lavacar-beloauto');

    await page.goto('/dashboard/bookings');
    await expect(page.getByRole('link', { name: 'Recursos' })).not.toBeVisible();

    // Manager-only route — proxy.ts redirects STAFF back to /dashboard before the page ever
    // renders, matching every other manager-only section (Equipe/Configurações/Hotsite).
    await page.goto('/dashboard/resources');
    await expect(page).toHaveURL('/dashboard');
  });
});
