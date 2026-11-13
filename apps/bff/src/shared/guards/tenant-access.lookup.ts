import { Inject, Injectable } from '@nestjs/common';
import { FEATURE_KEYS } from '@ikaro/validation';
import type { TenantAccessView } from '@ikaro/types';
import { Request } from 'express';
import { z } from 'zod';
import type { BffCache } from '../cache/bff-cache.port';
import { BackendInternalClient } from '../http/backend-internal-client';
import { resolvePublicTenant } from '../http/public-tenant';
import type { TenantInfoResponse } from '../types/backend-responses';

export const TENANT_ACCESS_CACHE = Symbol('TenantAccessCache');

// 300 s for an operational answer, 10 s for a `SUSPENDED` one: a suspension may take up to 10
// minutes to show on another instance (this cache on top of the backend's 300 s), a lifting 20 s.
export const OPERATIONAL_ACCESS_TTL_MS = 300_000;
export const SUSPENDED_ACCESS_TTL_MS = 10_000;
export const TENANT_ACCESS_CACHE_MAX_ENTRIES = 1_000;

// Only what the gate needs from the backend's access answer (S13). `degraded` marks a fail-open
// answer, which is never cached: caching it would pin a lookup error for five minutes.
const AccessAnswerSchema = z.object({
  operational: z.boolean(),
  features: z.array(z.object({ key: z.enum(FEATURE_KEYS) })),
  degraded: z.literal(true).optional(),
});

/** What `TenantAccessGuard` needs, so a spec can substitute an in-memory source. */
export interface TenantAccessSource {
  getAccess(tenantId: string, req: Request): Promise<TenantAccessView>;
  resolveTenantId(tenantSlug: string, req: Request): Promise<string>;
}

/**
 * The BFF side of `TenantAccessPort`: the backend's `GET /internal/billing/tenants/{id}/access`
 * behind the `BffCache` port (in-memory today). A singleton, so it calls the backend through
 * `BackendInternalClient`, as `ActiveStaffGuard` does (the request-scoped `BackendHttpService`
 * cannot be injected into a singleton guard).
 *
 * It throws on any failure; `TenantAccessGuard` turns a failure into a pass-through.
 */
@Injectable()
export class TenantAccessLookup implements TenantAccessSource {
  constructor(
    private readonly backend: BackendInternalClient,
    @Inject(TENANT_ACCESS_CACHE) private readonly cache: BffCache<TenantAccessView>,
  ) {}

  async getAccess(tenantId: string, req: Request): Promise<TenantAccessView> {
    const cached = await this.cache.get(tenantId);
    if (cached) return cached;

    const raw = await this.backend.get<unknown>(
      `/internal/billing/tenants/${tenantId}/access`,
      req,
    );
    const { degraded, ...access } = AccessAnswerSchema.parse(raw);
    if (!degraded) {
      const ttl = access.operational ? OPERATIONAL_ACCESS_TTL_MS : SUSPENDED_ACCESS_TTL_MS;
      await this.cache.set(tenantId, access, ttl);
    }
    return access;
  }

  /** Slug → tenant id for an `@Public()` route, through the cache `withPublicTenant` shares. */
  async resolveTenantId(tenantSlug: string, req: Request): Promise<string> {
    const tenant = await resolvePublicTenant(tenantSlug, () =>
      this.backend.get<TenantInfoResponse>(
        `/internal/tenants/by-slug/${encodeURIComponent(tenantSlug)}`,
        req,
      ),
    );
    return tenant.id;
  }
}
