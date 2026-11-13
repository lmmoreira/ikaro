import { Injectable } from '@nestjs/common';
import { FEATURE_KEYS } from '@ikaro/validation';
import type { TenantAccessView } from '@ikaro/types';
import { Request } from 'express';
import { z } from 'zod';
import { BackendInternalClient } from '../http/backend-internal-client';
import { tenantBySlugRead } from '../http/public-tenant';
import type { TenantInfoResponse } from '../types/backend-responses';

// 300 s for an operational answer, 10 s for a `SUSPENDED` one: a suspension may take up to 10
// minutes to show on another instance (this cache on top of the backend's 300 s), a lifting 20 s.
export const OPERATIONAL_ACCESS_TTL_MS = 300_000;
export const SUSPENDED_ACCESS_TTL_MS = 10_000;

// Only what the gate needs from the backend's access answer (S13). `degraded` marks a fail-open
// answer, which is never cached: caching it would pin a lookup error for five minutes.
const AccessAnswerSchema = z.object({
  operational: z.boolean(),
  features: z.array(z.object({ key: z.enum(FEATURE_KEYS) })),
  degraded: z.literal(true).optional(),
});

// How long the cache keeps an access answer: 300 s operational, 10 s `SUSPENDED`, and never a
// degraded one. An answer that does not match the contract is not cached either; the parse after the
// read rejects it.
function accessTtlMs(raw: unknown): number | undefined {
  const answer = AccessAnswerSchema.safeParse(raw);
  if (!answer.success || answer.data.degraded) return undefined;
  return answer.data.operational ? OPERATIONAL_ACCESS_TTL_MS : SUSPENDED_ACCESS_TTL_MS;
}

function toAccessView(answer: z.infer<typeof AccessAnswerSchema>): TenantAccessView {
  return { operational: answer.operational, features: answer.features };
}

/** What `TenantAccessGuard` needs, so a spec can substitute an in-memory source. */
export interface TenantAccessSource {
  getAccess(tenantId: string, req: Request): Promise<TenantAccessView>;
  resolveTenantId(tenantSlug: string, req: Request): Promise<string>;
}

/**
 * The BFF side of `TenantAccessPort`: the backend's `GET /internal/billing/tenants/{id}/access`
 * through `BackendInternalClient`, which caches it (`tenant-access:<id>`). A singleton, so it calls the backend through
 * `BackendInternalClient`, as `ActiveStaffGuard` does (the request-scoped `BackendHttpService`
 * cannot be injected into a singleton guard).
 *
 * It throws on any failure; `TenantAccessGuard` turns a failure into a pass-through.
 */
@Injectable()
export class TenantAccessLookup implements TenantAccessSource {
  constructor(private readonly backend: BackendInternalClient) {}

  async getAccess(tenantId: string, req: Request): Promise<TenantAccessView> {
    const raw = await this.backend.get<unknown>(
      `/internal/billing/tenants/${tenantId}/access`,
      req,
      // Keyed by the tenant id: the answer is that tenant's own, the same for every caller.
      { cache: { key: `tenant-access:${tenantId}`, ttlMs: accessTtlMs } },
    );
    return toAccessView(AccessAnswerSchema.parse(raw));
  }

  /** Slug → tenant id for an `@Public()` route, through the cache `withPublicTenant` shares. */
  async resolveTenantId(tenantSlug: string, req: Request): Promise<string> {
    const { path, cache } = tenantBySlugRead(tenantSlug);
    const tenant = await this.backend.get<TenantInfoResponse>(path, req, { cache });
    return tenant.id;
  }
}
