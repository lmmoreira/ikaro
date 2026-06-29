import type { Page } from '@playwright/test';

// Same fallback pattern as playwright.config.ts's PLAYWRIGHT_BASE_URL — the BFF URL the web
// app's running dev server was started with (NEXT_PUBLIC_BFF_URL) is not necessarily inherited
// by the Playwright test-runner process itself (a separate CI step in pr-e2e.yml), so this
// needs its own explicit default rather than reading process.env.NEXT_PUBLIC_BFF_URL directly.
export const BFF_URL = process.env.PLAYWRIGHT_BFF_URL ?? 'http://localhost:3002/v1';
export const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

if (!INTERNAL_API_KEY) {
  throw new Error('PLAYWRIGHT/INTERNAL_API_KEY is required for dev-login E2E helpers');
}

export interface DevLoginResponse {
  readonly accessToken: string;
  readonly user: {
    readonly sub: string;
    readonly tenantId: string;
    readonly tenantSlug: string;
    readonly role: 'CUSTOMER' | 'STAFF' | 'MANAGER';
  };
}

export async function addDevLoginCookie(page: Page, accessToken: string): Promise<void> {
  await page.context().addCookies([
    {
      name: 'access_token',
      value: accessToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}
