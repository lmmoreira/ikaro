import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { loginAsStaff, uniqueTestEmail } from './helpers/auth';
import { inviteStaff } from './helpers/staff';

function getMemberRow(page: Page, text: string) {
  return page.locator('.divide-y > div').filter({ hasText: text });
}

// Filtering role-option by visible text is unreliable: the MANAGER option's own description
// ("Tudo da Equipe + ...") contains "Equipe" as a substring, colliding with the STAFF option's
// title. The data-role attribute is unambiguous.
function getRoleOption(page: Page, role: 'STAFF' | 'MANAGER') {
  return page.locator(`[data-testid="role-option"][data-role="${role}"]`);
}

async function seedStaffMember(
  page: Page,
  overrides: {
    readonly firstName?: string;
    readonly lastName?: string;
    readonly role?: 'STAFF' | 'MANAGER';
  } = {},
): Promise<{ readonly staffId: string; readonly email: string; readonly name: string }> {
  const email = uniqueTestEmail('e2e-manage');
  const firstName = overrides.firstName ?? 'Teste';
  const lastName = overrides.lastName ?? 'E2E';
  const result = await inviteStaff(page, {
    email,
    firstName,
    lastName,
    role: overrides.role ?? 'STAFF',
  });

  return { staffId: result.staffId, email, name: `${firstName} ${lastName}` };
}

test.describe('team member detail/edit flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStaff(page, 'admin@lavacar.com.br', 'lavacar-beloauto');
  });

  test('edits a member name and role, returns to the list with updated values', async ({
    page,
  }) => {
    const member = await seedStaffMember(page, { firstName: 'Antes', lastName: 'Editar' });
    const updatedName = 'Depois Editado';

    await page.goto(`/dashboard/team/${member.staffId}`);
    await expect(page.getByTestId('staff-detail-name-input')).toHaveValue(member.name);

    await page.getByTestId('staff-detail-name-input').fill(updatedName);
    await getRoleOption(page, 'MANAGER').click();
    await page.getByTestId('staff-detail-save-desktop').click();

    await expect(page).toHaveURL('/dashboard/team');
    const row = getMemberRow(page, member.email);
    await expect(row).toContainText(updatedName);
    await expect(row).toContainText('Gerente');
  });

  test('shows inline validation when the name is cleared', async ({ page }) => {
    const member = await seedStaffMember(page);

    await page.goto(`/dashboard/team/${member.staffId}`);
    await page.getByTestId('staff-detail-name-input').fill('');
    await page.getByTestId('staff-detail-save-desktop').click();

    await expect(page.getByTestId('staff-detail-name-error')).toBeVisible();
    await expect(page).toHaveURL(`/dashboard/team/${member.staffId}`);
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

    await expect(page.getByTestId('staff-detail-submit-error')).toHaveText(
      'O estabelecimento precisa de pelo menos um gerente ativo.',
    );
    await expect(page.url()).toContain('/dashboard/team/');
  });

  test('renders the email field as read-only', async ({ page }) => {
    const member = await seedStaffMember(page);

    await page.goto(`/dashboard/team/${member.staffId}`);

    await expect(page.getByTestId('staff-detail-email-input')).toBeDisabled();
    await expect(page.getByTestId('staff-detail-email-input')).toHaveValue(member.email);
  });

  test('cancel returns to the team list without saving', async ({ page }) => {
    const member = await seedStaffMember(page, { firstName: 'Original', lastName: 'Nome' });

    await page.goto(`/dashboard/team/${member.staffId}`);
    await page.getByTestId('staff-detail-name-input').fill('Nao Deve Salvar');
    await page.getByRole('link', { name: 'Cancelar' }).click();

    await expect(page).toHaveURL('/dashboard/team');
    const row = getMemberRow(page, member.email);
    await expect(row).toContainText('Original Nome');
  });
});
