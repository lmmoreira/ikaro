// Extracts the tenant ID segment from a `tmp/<tenantId>/...` staging path — used by promotion
// logic (hotsite content save, booking photo promotion) to verify a client-supplied tmp path
// actually belongs to the caller's own tenant before promoting it to a permanent location.
// `tmp/` staging paths are bucket-root-prefixed (`tmp/<tenantId>/...`, not `tenants/<tenantId>/tmp/...`)
// so a single GCS lifecycle rule can match every tenant's staged objects with one static
// `matches_prefix` — see td/TD22-ORPHANED-UPLOAD-CLEANUP.md. This is why `extractTenantIdFromPath`
// (anchored on `tenants/`) isn't reusable here.
export function extractTenantIdFromTmpPath(filePath: string): string | null {
  const match = /^tmp\/([^/]+)\/.+$/.exec(filePath);
  return match?.[1] ?? null;
}
