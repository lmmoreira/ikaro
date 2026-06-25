import type { Page } from '@playwright/test';

// Same fallback pattern as playwright.config.ts's PLAYWRIGHT_BASE_URL — the BFF URL the web
// app's running dev server was started with (NEXT_PUBLIC_BFF_URL) is not necessarily inherited
// by the Playwright test-runner process itself (a separate CI step in pr-e2e.yml), so this
// needs its own explicit default rather than reading process.env.NEXT_PUBLIC_BFF_URL directly.
const BFF_URL = process.env.PLAYWRIGHT_BFF_URL ?? 'http://localhost:3002/v1';

interface DevLoginResponse {
  readonly accessToken: string;
  readonly user: {
    readonly sub: string;
    readonly tenantId: string;
    readonly tenantSlug: string;
    readonly role: 'CUSTOMER' | 'STAFF' | 'MANAGER';
  };
}

// Logs a Playwright page in as a customer via the BFF's dev-only /auth/dev-login endpoint
// (ENABLE_DEV_AUTH=true locally and in pr-e2e.yml) — the JWT cookie this sets is identical in
// shape to a real Google OAuth login, so every authenticated-customer flow can be E2E-tested
// without driving a real Google consent screen. find-or-create is idempotent per
// (email, tenantSlug): calling this twice for the same pair returns the same customer.
export async function loginAsCustomer(
  page: Page,
  email: string,
  tenantSlug: string,
): Promise<DevLoginResponse['user']> {
  const res = await page.request.post(`${BFF_URL}/auth/dev-login`, {
    data: { email, tenantSlug, type: 'customer' },
  });
  const body = (await res.json()) as DevLoginResponse;

  await page.context().addCookies([
    {
      name: 'access_token',
      value: body.accessToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  return body.user;
}

// Logs a Playwright page in as a staff member via the BFF's dev-only /auth/dev-login endpoint.
// The email must correspond to an existing seed staff record at the given tenant — dev-login
// looks up by email (not find-or-create) and links the dev::email OAuth ID on first call.
// Seed staff emails: admin@lavacar.com.br (lavacar-beloauto), admin@ikaro.com (ikaro),
// admin@autospa.com.br (autospa-premium).
export async function loginAsStaff(
  page: Page,
  email: string,
  tenantSlug: string,
): Promise<DevLoginResponse['user']> {
  const res = await page.request.post(`${BFF_URL}/auth/dev-login`, {
    data: { email, tenantSlug, type: 'staff' },
  });
  const body = (await res.json()) as DevLoginResponse;

  await page.context().addCookies([
    {
      name: 'access_token',
      value: body.accessToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  return body.user;
}

// A fresh, unique email per call — guarantees a brand-new customer row (phone/defaultAddress
// both null) rather than reusing one a previous test run may have already completed.
export function uniqueTestEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}@e2e.example.com`;
}

// Fills in phone + address directly via the BFF, bypassing InformationCompletionPrompt's UI —
// for tests whose focus is elsewhere (e.g. switch-tenant) and that need the mandatory prompt to
// already be satisfied so it doesn't cover the page. Requires loginAsCustomer(page, ..., tenantSlug)
// to have run first, since this reuses the same cookie jar (page.request shares browser-context
// cookies regardless of the request's own origin).
export async function completeCustomerProfile(page: Page, tenantSlug: string): Promise<void> {
  await page.request.patch(`${BFF_URL}/customers/me`, {
    headers: { 'X-Tenant-Slug': tenantSlug },
    data: {
      phone: '+5511999999999',
      defaultAddress: {
        street: 'Rua das Acácias',
        number: '45',
        neighborhood: 'Jardim América',
        city: 'Belo Horizonte',
        state: 'MG',
        zipCode: '30130-020',
      },
    },
  });
}
