import { expect, test } from '@playwright/test';
import { loginAsStaff, uniqueTestEmail } from './helpers/auth';
import { getMemberRow, getRoleOption, inviteStaff } from './helpers/staff';

// These specs assert on the team list, which shows the first 100 members (oldest first). The booking
// specs invite a staff member for every STAFF resource they seed and never remove them, so on
// lavacar-beloauto the list is full by the time these run and a member created here is not on it.
// equipe-e2e is a tenant of its own (seed.ts) that no other spec invites staff into.
const TEAM_TENANT = 'equipe-e2e';
const TEAM_MANAGER = 'admin@equipe-e2e.com.br';

test.describe('team invite flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStaff(page, TEAM_MANAGER, TEAM_TENANT);
  });

  test('invites a new STAFF member and shows it as pending on the list', async ({ page }) => {
    const email = uniqueTestEmail('e2e-invite-staff');

    await page.goto('/dashboard/team/invite');
    await page.getByTestId('invite-first-name-input').fill('Maria');
    await page.getByTestId('invite-last-name-input').fill('Teste');
    await page.getByTestId('invite-email-input').fill(email);
    await page.getByRole('button', { name: 'Enviar convite' }).click();

    await expect(page).toHaveURL(`/dashboard/team?invited=${encodeURIComponent(email)}`);
    await expect(page.getByTestId('team-invite-success-banner')).toBeVisible();

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
    await page.getByTestId('invite-email-input').fill(TEAM_MANAGER);
    await page.getByRole('button', { name: 'Enviar convite' }).click();

    // The message is the input's accessible description (aria-describedby points at it).
    await expect(page.getByTestId('invite-email-input')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('invite-email-input')).toHaveAccessibleDescription(
      'Já existe um membro da equipe com este e-mail neste estabelecimento.',
    );
  });

  test('shows inline validation for empty name fields and an invalid email', async ({ page }) => {
    await page.goto('/dashboard/team/invite');
    await page.getByTestId('invite-email-input').fill('not-an-email');
    await page.getByRole('button', { name: 'Enviar convite' }).click();

    await expect(page.getByTestId('invite-first-name-input')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(page.getByTestId('invite-last-name-input')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(page.getByTestId('invite-email-input')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('invite-first-name-input')).toBeFocused();
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
