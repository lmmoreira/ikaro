import { HttpStatus } from '@nestjs/common';
import { BffErrorCode } from '@ikaro/types';
import { BackendHttpService } from './backend-http.service';
import type { BackendCacheOption } from './backend-read-cache';
import { throwProblemDetail } from './problem-detail';
import { TenantInfoResponse } from '../types/backend-responses';

// A renamed slug resolves to the old tenant for at most this long: the operational TTL, no worse
// than the 300 s ISR already in front of a public page. Per instance by design.
export const PUBLIC_TENANT_TTL_MS = 300_000;

/**
 * The one by-slug read every public route starts from, as the path and the cache declaration its
 * callers pass to a backend client. `TenantAccessGuard`, `withPublicTenant` and the hotsite
 * manifest all use it, so they share one cache entry per slug: a public request costs one by-slug
 * hop per TTL window instead of two or more. The key is the slug alone because the answer is the
 * same for every caller.
 */
export function tenantBySlugRead(tenantSlug: string): {
  path: string;
  cache: BackendCacheOption<TenantInfoResponse>;
} {
  return {
    path: `/internal/tenants/by-slug/${encodeURIComponent(tenantSlug)}`,
    cache: { key: `tenant-by-slug:${tenantSlug}`, ttlMs: PUBLIC_TENANT_TTL_MS },
  };
}

/** The by-slug read every public route starts from, cached through the backend client. */
export function resolvePublicTenantViaBackend(
  backendHttp: BackendHttpService,
  tenantSlug: string,
): Promise<TenantInfoResponse> {
  const { path, cache } = tenantBySlugRead(tenantSlug);
  return backendHttp.get<TenantInfoResponse>(path, undefined, { cache });
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
