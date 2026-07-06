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

test.describe('team invite flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStaff(page, 'admin@lavacar.com.br', 'lavacar-beloauto');
  });

  test('invites a new STAFF member and shows it as pending on the list', async ({ page }) => {
    const email = uniqueTestEmail('e2e-invite-staff');

    await page.goto('/dashboard/team/invite');
    await page.getByTestId('invite-first-name-input').fill('Maria');
    await page.getByTestId('invite-last-name-input').fill('Teste');
    await page.getByTestId('invite-email-input').fill(email);
    await page.getByRole('button', { name: 'Enviar convite' }).click();

    await expect(page).toHaveURL(`/dashboard/team?invited=${encodeURIComponent(email)}`);
    await expect(page.getByText('Convite enviado!')).toBeVisible();

    const row = getMemberRow(page, email);
    await expect(row).toContainText('Convite pendente');
    await expect(row).toContainText('Equipe');
  });

  test('invites a new MANAGER member and shows the Gerente role badge', async ({ page }) => {
    const email = uniqueTestEmail('e2e-invite-manager');

    await page.goto('/dashboard/team/invite');
    await page.getByTestId('invite-first-name-input').fill('Carlos');
    await page.getByTestId('invite-last-name-input').fill('Gerente');
    await page.getByTestId('invite-email-input').fill(email);
    await getRoleOption(page, 'MANAGER').click();
    await page.getByRole('button', { name: 'Enviar convite' }).click();

    await expect(page).toHaveURL(`/dashboard/team?invited=${encodeURIComponent(email)}`);
    const row = getMemberRow(page, email);
    await expect(row).toContainText('Gerente');
    await expect(row).toContainText('Convite pendente');
  });

  test('resends an invite with one click — no navigation, no retyping', async ({ page }) => {
    const email = uniqueTestEmail('e2e-resend');
    await inviteStaff(page, { email, firstName: 'Resend', lastName: 'Teste', role: 'STAFF' });

    await page.goto('/dashboard/team');
    const row = getMemberRow(page, email);
    await row.getByTestId('resend-invite-button').click();

    await expect(row.getByTestId('resend-invite-success')).toBeVisible();
    await expect(page).toHaveURL('/dashboard/team');
  });

  test('shows a 409 inline error when inviting an email that already has an active record', async ({
    page,
  }) => {
    await page.goto('/dashboard/team/invite');
    await page.getByTestId('invite-first-name-input').fill('Duplicado');
    await page.getByTestId('invite-last-name-input').fill('Teste');
    await page.getByTestId('invite-email-input').fill('admin@lavacar.com.br');
    await page.getByRole('button', { name: 'Enviar convite' }).click();

    await expect(page.getByTestId('invite-email-error')).toHaveText(
      'Este e-mail já está cadastrado na sua equipe.',
    );
  });

  test('shows inline validation for empty name fields and an invalid email', async ({ page }) => {
    await page.goto('/dashboard/team/invite');
    await page.getByTestId('invite-email-input').fill('not-an-email');
    await page.getByRole('button', { name: 'Enviar convite' }).click();

    await expect(page.getByTestId('invite-first-name-error')).toBeVisible();
    await expect(page.getByTestId('invite-last-name-error')).toBeVisible();
    await expect(page.getByTestId('invite-email-error')).toBeVisible();
  });

  test('back arrow returns to the team list without submitting', async ({ page }) => {
    await page.goto('/dashboard/team/invite');
    await page.locator('header').getByRole('link', { name: 'Equipe' }).click();

    await expect(page).toHaveURL('/dashboard/team');
  });

  test('selecting Gerente updates the topbar role badge live', async ({ page }) => {
    await page.goto('/dashboard/team/invite');

    await expect(page.locator('header')).toContainText('Equipe');
    await getRoleOption(page, 'MANAGER').click();
    await expect(page.locator('header')).toContainText('Gerente');
  });
});
