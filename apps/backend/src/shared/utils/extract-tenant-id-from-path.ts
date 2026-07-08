// Extracts the tenant ID segment from a `tenants/<tenantId>/...` storage path — used by use
// cases that receive a client-supplied storage path (feature-booking-photo, delete-hotsite-image)
// and must verify it actually belongs to the caller's own tenant before acting on it. Callers
// still rely on their own DTO's Zod schema to validate the full path shape (e.g.
// `tenants/<id>/hotsite/...` vs `tenants/<id>/bookings/<id>/...`) — this only extracts the ID.
export function extractTenantIdFromPath(filePath: string): string | null {
  const match = /^tenants\/([^/]+)\//.exec(filePath);
  return match?.[1] ?? null;
}
