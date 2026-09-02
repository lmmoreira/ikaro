import { expect, test } from '@playwright/test';
import { loginAsStaff, uniqueTestEmail } from './helpers/auth';
import { inviteStaff } from './helpers/staff';
import { getResourceRow } from './helpers/booking';

test.describe('manager resource management flow', () => {
  test('creates a STAFF resource, sees it in the list, deactivates it, reactivates it', async ({
    page,
  }) => {
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

    await row.getByTestId('resource-row-deactivate-link').click();
    await expect(page).toHaveURL(/\/dashboard\/resources\/.+\/deactivate/);
    await page.getByTestId('resource-deactivate-confirm-desktop').click();

    await expect(page).toHaveURL('/dashboard/resources');
    const inactiveRow = getResourceRow(page, 'Recurso Teste');
    await expect(inactiveRow).toContainText('Inativo');

    // Reactivation is a one-click row action, no navigation — mirrors TeamListPage's own
    // established precedent (reactivate has no dedicated confirmation screen).
    await inactiveRow.getByTestId('resource-row-reactivate-button').click();
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
    await expect(page.getByTestId('sidebar-nav-resources')).not.toBeVisible();

    // Manager-only route — proxy.ts redirects STAFF back to /dashboard before the page ever
    // renders, matching every other manager-only section (Equipe/Configurações/Hotsite).
    // /dashboard itself then redirects to /dashboard/bookings (app/dashboard/page.tsx) — the
    // real final landing page after the double redirect.
    await page.goto('/dashboard/resources');
    await expect(page).toHaveURL('/dashboard/bookings');
  });
});
