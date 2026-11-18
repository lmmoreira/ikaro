import { request as playwrightRequest } from '@playwright/test';
import { INTERNAL_API_KEY } from '../auth/shared';

// The operator and provisioning routes live on the BACKEND (`/internal/*`, behind
// `InternalApiGuard` and, for the operator and tenant routes, `PlatformAdminGuard`), not on the
// BFF: no product route proxies them. The runner reaches the backend directly, as
// `scripts/provision-tenant.sh` and `scripts/billing-operator.sh` do from the relay VM.
//
// The key is read here, not in `auth/shared.ts`, so a developer whose `.env.playwright.local`
// predates it fails only the specs that need it, never every spec that imports a login helper.
export const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://localhost:3001';
const PLATFORM_ADMIN_KEY = process.env.PLATFORM_ADMIN_KEY;

if (!PLATFORM_ADMIN_KEY) {
  throw new Error(
    'PLATFORM_ADMIN_KEY is required for the billing E2E helpers (the operator and tenant routes)',
  );
}

const OPERATOR_HEADERS = {
  'Content-Type': 'application/json',
  'X-Internal-Key': INTERNAL_API_KEY!,
  'X-Platform-Admin-Key': PLATFORM_ADMIN_KEY,
};

const INTERNAL_HEADERS = {
  'Content-Type': 'application/json',
  'X-Internal-Key': INTERNAL_API_KEY!,
};

export type BackendAuth = 'internal' | 'operator';

// One direct call to the backend, through a Playwright request context of its own (never a page's,
// whose cookie jar a call must not touch). Throws with the status and body on a non-2xx, so a
// fixture that cannot be set up fails with the backend's own reason instead of a later, unrelated
// timeout.
export async function backendCall<T>(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  auth: BackendAuth,
  body?: unknown,
): Promise<T> {
  const context = await playwrightRequest.newContext();
  try {
    const res = await context.fetch(`${BACKEND_URL}${path}`, {
      method,
      headers: auth === 'operator' ? OPERATOR_HEADERS : INTERNAL_HEADERS,
      data: body,
    });
    if (!res.ok()) {
      throw new Error(`${method} ${path} failed: ${res.status()} ${await res.text()}`);
    }
    return (await res.json()) as T;
  } finally {
    await context.dispose();
  }
}
