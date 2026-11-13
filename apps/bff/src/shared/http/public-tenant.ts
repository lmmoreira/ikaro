import { HttpStatus } from '@nestjs/common';
import { BffErrorCode } from '@ikaro/types';
import { TtlCache } from '../cache/ttl-cache';
import { BackendHttpService } from './backend-http.service';
import { throwProblemDetail } from './problem-detail';
import { TenantInfoResponse } from '../types/backend-responses';

// A renamed slug resolves to the old tenant for at most this long: the operational TTL, no worse
// than the 300 s ISR already in front of a public page. Per instance by design.
export const PUBLIC_TENANT_ID_TTL_MS = 300_000;
const PUBLIC_TENANT_ID_MAX_ENTRIES = 1_000;

// One resolved tenant per slug serves both `TenantAccessGuard` and `withPublicTenant`, so a public
// request costs one by-slug hop per TTL window instead of two per request.
export const publicTenantIdCache = new TtlCache<string>({
  maxEntries: PUBLIC_TENANT_ID_MAX_ENTRIES,
});

/**
 * Slug → tenant id through the shared bounded cache. `fetchTenantId` is the one backend hop (the
 * guard is singleton-scoped and cannot use the request-scoped `BackendHttpService`, so each caller
 * brings its own). A failed lookup (an unknown slug, an outage) is never cached.
 */
export async function resolvePublicTenantId(
  tenantSlug: string,
  fetchTenantId: () => Promise<string>,
): Promise<string> {
  const cached = publicTenantIdCache.get(tenantSlug);
  if (cached) return cached;
  const tenantId = await fetchTenantId();
  publicTenantIdCache.set(tenantSlug, tenantId, PUBLIC_TENANT_ID_TTL_MS);
  return tenantId;
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

  const tenantId = await resolvePublicTenantId(tenantSlug, async () => {
    const tenant = await backendHttp.get<TenantInfoResponse>(
      `/internal/tenants/by-slug/${encodeURIComponent(tenantSlug)}`,
    );
    return tenant.id;
  });
  return run(tenantId);
}
