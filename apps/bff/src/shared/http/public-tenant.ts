import { HttpStatus } from '@nestjs/common';
import { BffErrorCode } from '@ikaro/types';
import { InMemoryBffCache } from '../cache/in-memory-bff-cache';
import { BackendHttpService } from './backend-http.service';
import { throwProblemDetail } from './problem-detail';
import { TenantInfoResponse } from '../types/backend-responses';

// A renamed slug resolves to the old tenant for at most this long: the operational TTL, no worse
// than the 300 s ISR already in front of a public page. Per instance by design.
export const PUBLIC_TENANT_TTL_MS = 300_000;
const PUBLIC_TENANT_MAX_ENTRIES = 1_000;

// One resolved tenant per slug serves `TenantAccessGuard`, `withPublicTenant` and the hotsite
// manifest (which returns the tenant info itself), so a public request costs one by-slug hop per
// TTL window instead of two or more per request.
//
// The helpers below are plain functions (13 controller call sites hold a `BackendHttpService`, not an
// injected resolver), so this is the one module-level cache. It is the in-memory `BffCache` adapter;
// moving to Redis is this one declaration. The access cache is injected by token instead
// (`TENANT_ACCESS_CACHE`), because its only consumer is a Nest provider.
export const publicTenantCache = new InMemoryBffCache<TenantInfoResponse>({
  maxEntries: PUBLIC_TENANT_MAX_ENTRIES,
});

/**
 * Slug → tenant through the shared bounded cache. `fetchTenant` is the one backend hop (the guard
 * is singleton-scoped and cannot use the request-scoped `BackendHttpService`, so each caller brings
 * its own). A failed lookup (an unknown slug, an outage) is never cached.
 */
export async function resolvePublicTenant(
  tenantSlug: string,
  fetchTenant: () => Promise<TenantInfoResponse>,
): Promise<TenantInfoResponse> {
  const cached = await publicTenantCache.get(tenantSlug);
  if (cached) return cached;
  const tenant = await fetchTenant();
  await publicTenantCache.set(tenantSlug, tenant, PUBLIC_TENANT_TTL_MS);
  return tenant;
}

/** The by-slug read every public route starts from, cached through `resolvePublicTenant`. */
export function resolvePublicTenantViaBackend(
  backendHttp: BackendHttpService,
  tenantSlug: string,
): Promise<TenantInfoResponse> {
  return resolvePublicTenant(tenantSlug, () =>
    backendHttp.get<TenantInfoResponse>(
      `/internal/tenants/by-slug/${encodeURIComponent(tenantSlug)}`,
    ),
  );
}

export async function withPublicTenant<T>(
  backendHttp: BackendHttpService,
  tenantSlug: string | undefined,
  run: (tenantId: string) => Promise<T>,
): Promise<T> {
  if (!tenantSlug) {
    throw throwProblemDetail(
      HttpStatus.BAD_REQUEST,
      BffErrorCode.TENANT_SLUG_HEADER_REQUIRED,
      'X-Tenant-Slug header is required',
    );
  }

  const tenant = await resolvePublicTenantViaBackend(backendHttp, tenantSlug);
  return run(tenant.id);
}
