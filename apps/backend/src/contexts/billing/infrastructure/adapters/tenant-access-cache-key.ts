/** One key builder for the reader (`CachingTenantAccessAdapter`) and the evictor (the invalidator). */
export function tenantAccessCacheKey(tenantId: string): string {
  return `billing:tenant-access:${tenantId}`;
}
