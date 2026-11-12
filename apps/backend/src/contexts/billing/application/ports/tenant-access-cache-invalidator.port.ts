export const TENANT_ACCESS_CACHE_INVALIDATOR = Symbol('TenantAccessCacheInvalidator');

/**
 * Evicts one tenant's cached access answer. Called by the use case that changed the tenant's
 * state, on its own instance, best-effort and only after the transaction committed. Other
 * instances rely on the TTL (`CachePort` has no cross-instance broadcast). Never throws.
 */
export interface TenantAccessCacheInvalidator {
  invalidate(tenantId: string): Promise<void>;
}
