import { expect, test } from '@playwright/test';
import { loginAsStaff } from './helpers/auth';
import { deactivateStaff, getMemberRow, seedStaffMember } from './helpers/staff';

// These specs assert on the team list, which shows the first 100 members (oldest first). The booking
// specs invite a staff member for every STAFF resource they seed and never remove them, so on
// lavacar-beloauto the list is full by the time these run and a member created here is not on it.
// equipe-e2e is a tenant of its own (seed.ts) that no other spec invites staff into.
const TEAM_TENANT = 'equipe-e2e';
const TEAM_MANAGER = 'admin@equipe-e2e.com.br';

test.describe('team member deactivate/activate flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStaff(page, TEAM_MANAGER, TEAM_TENANT);
  });

  test('deactivates an active member from the list, redirects and updates the badge', async ({
    page,
  }) => {
    const member = await seedStaffMember(page, {
      tenantSlug: TEAM_TENANT,
      emailPrefix: 'e2e-deactivate',
      firstName: 'Ativo',
      lastName: 'Alvo',
      linkGoogleAccount: true,
    });

    await page.goto('/dashboard/team');
    const row = getMemberRow(page, member.email);
    await expect(row).toContainText('Ativo');
    await row.getByRole('link', { name: 'Desativar' }).click();

    await expect(page).toHaveURL(`/dashboard/team/${member.staffId}/deactivate`);
    await page.getByRole('button', { name: 'Confirmar desativação' }).first().click();

    await expect(page).toHaveURL('/dashboard/team');
    await expect(getMemberRow(page, member.email)).toContainText('Inativo');
  });

  test('activates a deactivated member directly from the list, no navigation', async ({ page }) => {
    const member = await seedStaffMember(page, {
      tenantSlug: TEAM_TENANT,
      emailPrefix: 'e2e-activate',
      firstName: 'Inativo',
      lastName: 'Alvo',
      linkGoogleAccount: true,
    });
    await deactivateStaff(page, member.staffId);

    await page.goto('/dashboard/team');
    const row = getMemberRow(page, member.email);
    await expect(row).toContainText('Inativo');

    await row.getByTestId('activate-member-button').click();

    // Confirms the router.refresh() fix: the badge and action both update in place,
    // no stale "Inativo"/"Ativar" left behind after a successful activation.
    await expect(page).toHaveURL('/dashboard/team');
    await expect(row).toContainText('Ativo');
    await expect(row.getByRole('link', { name: 'Desativar' })).toBeVisible();
    await expect(row.getByTestId('resend-invite-button')).toHaveCount(0);
  });

  test('blocks self-deactivation with an inline 403 error', async ({ page }) => {
    const { sub } = await loginAsStaff(page, TEAM_MANAGER, TEAM_TENANT);

    // Direct navigation — the list never renders Desativar on the caller's own row,
    // this exercises the API-level defensive guard behind that UI-level hiding.
    await page.goto(`/dashboard/team/${sub}/deactivate`);
    await page.getByRole('button', { name: 'Confirmar desativação' }).first().click();

    await expect(page.getByTestId('page-feedback')).toContainText(
      'Você não pode desativar sua própria conta.',
    );
    await expect(page.url()).toContain(`/dashboard/team/${sub}/deactivate`);
  });
});
