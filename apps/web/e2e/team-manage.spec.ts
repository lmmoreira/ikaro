import { expect, test } from '@playwright/test';
import { loginAsStaff } from './helpers/auth';
import { getMemberRow, getRoleOption, seedStaffMember } from './helpers/staff';

// These specs assert on the team list, which shows the first 100 members (oldest first). The booking
// specs invite a staff member for every STAFF resource they seed and never remove them, so on
// lavacar-beloauto the list is full by the time these run and a member created here is not on it.
// equipe-e2e is a tenant of its own (seed.ts) that no other spec invites staff into.
const TEAM_TENANT = 'equipe-e2e';
const TEAM_MANAGER = 'admin@equipe-e2e.com.br';

test.describe('team member detail/edit flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStaff(page, TEAM_MANAGER, TEAM_TENANT);
  });

  test('edits a member name and role, returns to the list with updated values', async ({
    page,
  }) => {
    const member = await seedStaffMember(page, {
      tenantSlug: TEAM_TENANT,
      firstName: 'Antes',
      lastName: 'Editar',
    });
    const updatedName = 'Depois Editado';

    await page.goto(`/dashboard/team/${member.staffId}`);
    await expect(page.getByTestId('staff-detail-name-input')).toHaveValue(member.name);
    await expect(page.getByTestId('staff-detail-email-input')).toBeDisabled();
    await expect(page.getByTestId('staff-detail-email-input')).toHaveValue(member.email);

    await page.getByTestId('staff-detail-name-input').fill(updatedName);
    await getRoleOption(page, 'MANAGER').click();
    await page.getByTestId('staff-detail-save-desktop').click();

    await expect(page).toHaveURL('/dashboard/team');
    const row = getMemberRow(page, member.email);
    await expect(row).toContainText(updatedName);
    await expect(row).toContainText('Gerente');
  });

  test('blocks demoting the only active manager with an inline 409 error', async ({ page }) => {
    // autospa-premium seeds exactly one active MANAGER (admin@autospa.com.br) and no other staff.
    // The seeded row has no `name` (raw SQL insert, never logged in), so the name field must be
    // filled before saving — otherwise client-side validation blocks the request before it ever
    // reaches the last-manager guard this test is actually exercising.
    await loginAsStaff(page, 'admin@autospa.com.br', 'autospa-premium');
    await page.goto('/dashboard/team');

    await page.getByRole('link', { name: 'Ver detalhes de admin@autospa.com.br' }).click();
    await page.getByTestId('staff-detail-name-input').fill('Admin AutoSpa');
    await getRoleOption(page, 'STAFF').click();
    await page.getByTestId('staff-detail-save-desktop').click();

    await expect(page.getByTestId('action-pane-desktop').getByTestId('form-feedback')).toHaveText(
      'Não é possível remover o último gerente ativo.',
    );
    await expect(page.url()).toContain('/dashboard/team/');
  });

  test('cancel returns to the team list without saving', async ({ page }) => {
    const member = await seedStaffMember(page, {
      tenantSlug: TEAM_TENANT,
      firstName: 'Original',
      lastName: 'Nome',
    });

    await page.goto(`/dashboard/team/${member.staffId}`);
    await page.getByTestId('staff-detail-name-input').fill('Nao Deve Salvar');
    await page.getByRole('link', { name: 'Cancelar' }).click();

    await expect(page).toHaveURL('/dashboard/team');
    const row = getMemberRow(page, member.email);
    await expect(row).toContainText('Original Nome');
  });
});
