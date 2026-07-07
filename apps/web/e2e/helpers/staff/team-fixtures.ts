import type { Page } from '@playwright/test';
import { linkStaffGoogleAccount, uniqueTestEmail } from '../auth';
import { inviteStaff } from './staff-api';

export interface SeededStaffMember {
  readonly staffId: string;
  readonly email: string;
  readonly name: string;
}

export async function seedStaffMember(
  page: Page,
  overrides: {
    readonly emailPrefix?: string;
    readonly firstName?: string;
    readonly lastName?: string;
    readonly role?: 'STAFF' | 'MANAGER';
    readonly tenantSlug?: string;
    // A freshly-invited member is PENDING (no Google account linked yet). Set this when a test
    // needs the member to already be ACTIVE — e.g. to exercise the Desativar action, which only
    // renders for ACTIVE rows.
    readonly linkGoogleAccount?: boolean;
  } = {},
): Promise<SeededStaffMember> {
  const email = uniqueTestEmail(overrides.emailPrefix ?? 'e2e-manage');
  const firstName = overrides.firstName ?? 'Teste';
  const lastName = overrides.lastName ?? 'E2E';
  const result = await inviteStaff(page, {
    email,
    firstName,
    lastName,
    role: overrides.role ?? 'STAFF',
  });

  if (overrides.linkGoogleAccount) {
    await linkStaffGoogleAccount(email, overrides.tenantSlug ?? 'lavacar-beloauto');
  }

  return { staffId: result.staffId, email, name: `${firstName} ${lastName}` };
}
