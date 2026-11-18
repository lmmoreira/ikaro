import { expect } from '@playwright/test';
import { backendCall } from './backend';

// What the backend serves for `GET /internal/billing/tenants/:id/access` (the cached answer of the
// shared `TenantAccessPort`).
export interface TenantAccessAnswer {
  readonly status: string;
  readonly operational: boolean;
  readonly features: readonly { readonly key: string; readonly tier: string }[];
}

// The operator's own audit trail names who acted and why; both are required by the route.
const OPERATOR = 'e2e-suspension-helper';

// A reinstatement shows within the suspended answer's 10 s TTL on any instance; a suspension
// through the operator route runs on the one backend instance that serves the E2E stack and evicts
// its own cache on `save()`, so it shows at once. Assertions that follow a transition still poll.
export const REINSTATEMENT_BOUND_MS = 10_000;

// Suspends through the operator route, never with SQL: a direct UPDATE does not evict the access
// cache, so the suspension would show only after it expires (up to 300 s).
export async function operatorSuspend(tenantId: string): Promise<void> {
  await backendCall('POST', `/internal/tenants/${tenantId}/billing/suspend`, 'operator', {
    operator: OPERATOR,
    reason: 'E2E: suspended-experience scenario',
  });
}

export async function operatorUnsuspend(tenantId: string): Promise<void> {
  await backendCall('POST', `/internal/tenants/${tenantId}/billing/unsuspend`, 'operator', {
    operator: OPERATOR,
    reason: 'E2E: restore after the scenario',
  });
}

export function readTenantAccess(tenantId: string): Promise<TenantAccessAnswer> {
  return backendCall<TenantAccessAnswer>(
    'GET',
    `/internal/billing/tenants/${tenantId}/access`,
    'internal',
  );
}

// Waits until the backend itself serves the expected state, so a UI assertion that follows is never
// racing the cache. A tenant whose features were removed after a read would never reach the
// expected answer within the bound and fails here with a clear message instead of in the UI.
export async function expectAccess(
  tenantId: string,
  expected: { readonly operational: boolean },
  timeoutMs = REINSTATEMENT_BOUND_MS,
): Promise<void> {
  await expect
    .poll(async () => (await readTenantAccess(tenantId)).operational, {
      timeout: timeoutMs,
      message: `the backend answer for tenant ${tenantId}`,
    })
    .toBe(expected.operational);
}

export async function expectFeatures(
  tenantId: string,
  expected: readonly string[],
  timeoutMs = REINSTATEMENT_BOUND_MS,
): Promise<void> {
  await expect
    .poll(
      async () => (await readTenantAccess(tenantId)).features.map((feature) => feature.key).sort(),
      {
        timeout: timeoutMs,
        message: `the features the backend serves for tenant ${tenantId} (a stale cached answer?)`,
      },
    )
    .toEqual([...expected].sort());
}
