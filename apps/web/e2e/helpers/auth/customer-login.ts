import type { Page } from '@playwright/test';
import { addDevLoginCookie, BFF_URL, INTERNAL_API_KEY, type DevLoginResponse } from './shared';

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
    headers: { 'X-Internal-Key': INTERNAL_API_KEY! },
    data: { email, tenantSlug, type: 'customer' },
  });
  if (!res.ok()) throw new Error(`dev-login failed: ${res.status()} ${await res.text()}`);
  const body = (await res.json()) as DevLoginResponse;

  await addDevLoginCookie(page, body.accessToken);
  return body.user;
}
