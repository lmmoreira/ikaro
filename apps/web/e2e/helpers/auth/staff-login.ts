import { request as playwrightRequest, type Page } from '@playwright/test';
import { addDevLoginCookie, BFF_URL, INTERNAL_API_KEY, type DevLoginResponse } from './shared';

// Logs a Playwright page in as a staff member via the BFF's dev-only /auth/dev-login endpoint.
// The email must correspond to an existing seed staff record at the given tenant — dev-login
// looks up by email (not find-or-create) and links the dev::email OAuth ID on first call.
// Seed staff emails: admin@lavacar.com.br (lavacar-beloauto manager),
// funcionario@lavacar.com.br (lavacar-beloauto staff), admin@ikaro.com (ikaro),
// admin@autospa.com.br (autospa-premium).
export async function loginAsStaff(
  page: Page,
  email: string,
  tenantSlug: string,
): Promise<DevLoginResponse['user']> {
  const res = await page.request.post(`${BFF_URL}/auth/dev-login`, {
    headers: { 'X-Internal-Key': INTERNAL_API_KEY! },
    data: { email, tenantSlug, type: 'staff' },
  });
  if (!res.ok()) throw new Error(`dev-login failed: ${res.status()} ${await res.text()}`);
  const body = (await res.json()) as DevLoginResponse;

  await addDevLoginCookie(page, body.accessToken);
  return body.user;
}

// Simulates a staff member's first Google login WITHOUT touching the current page's session
// cookie — used by fixtures that need a seeded (invited) member to already be ACTIVE rather
// than PENDING, while the test's actual actor stays logged in as whoever called this.
//
// Must run through an isolated request context, not `page.request`: the BFF's dev-login
// endpoint sets an access_token cookie on every response, and `page.request` shares the
// page's cookie jar — it would silently overwrite the current session with the seeded
// member's token even though we never call addDevLoginCookie here.
export async function linkStaffGoogleAccount(email: string, tenantSlug: string): Promise<void> {
  const context = await playwrightRequest.newContext();
  try {
    const res = await context.post(`${BFF_URL}/auth/dev-login`, {
      headers: { 'X-Internal-Key': INTERNAL_API_KEY! },
      data: { email, tenantSlug, type: 'staff' },
    });
    if (!res.ok()) {
      throw new Error(`link staff google account failed: ${res.status()} ${await res.text()}`);
    }
  } finally {
    await context.dispose();
  }
}
