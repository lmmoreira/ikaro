// Storage paths (tenants/<tenantId>/hotsite/<purpose>/<uuid>/<fileName> or
// tmp/<tenantId>/<purpose>/<uuid>/<fileName>) end in the original uploaded fileName, which can
// carry PII (e.g. a photo named after a customer). The <uuid> segment already uniquely identifies
// the object for debugging, so redacting only the final segment loses no operational value.
export function redactStoragePathForLogging(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  if (lastSlash === -1) return '<redacted>';
  return `${path.slice(0, lastSlash)}/<redacted>`;
}
