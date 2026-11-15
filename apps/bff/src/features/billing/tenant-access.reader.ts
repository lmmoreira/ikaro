import type { BackendHttpService } from '../../shared/http/backend-http.service';
import { BackendTenantAccessSchema } from './billing.schemas';
import { recoverAccessLookup, type AccessLookupLogger } from './billing.mapper';
import type { BackendTenantAccess } from './billing.types';

// The one BFF read of a tenant's access answer (UC-120). The current tenant's `GET /billing/access`
// and the per-tenant `operational` flag of the staff and customer tenant lists all go through it,
// so the fail-open recovery (a 4xx is rethrown, anything else answers "operational" and is logged)
// exists once. It adds no cache of its own: the backend port keeps the 300 s / 10 s cache.
export function readTenantAccess(
  backendHttp: BackendHttpService,
  tenantId: string,
  logger: AccessLookupLogger,
): Promise<BackendTenantAccess> {
  return backendHttp
    .get<unknown>(`/internal/billing/tenants/${tenantId}/access`)
    .then((raw) => BackendTenantAccessSchema.parse(raw))
    .catch((err: unknown) => recoverAccessLookup(err, tenantId, logger));
}

/** `operational` for each tenant id, read in parallel (a caller belongs to a handful of tenants). */
export async function readOperationalByTenant(
  backendHttp: BackendHttpService,
  tenantIds: readonly string[],
  logger: AccessLookupLogger,
): Promise<Map<string, boolean>> {
  const unique = [...new Set(tenantIds)];
  const answers = await Promise.all(unique.map((id) => readTenantAccess(backendHttp, id, logger)));
  return new Map(unique.map((id, i) => [id, answers[i].operational]));
}
