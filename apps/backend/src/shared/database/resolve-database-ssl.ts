/**
 * Cloud SQL enforces ssl_mode=ENCRYPTED_ONLY (not the stricter mTLS mode --
 * modules/database's own Checkov-skip comment documents that choice), so
 * rejectUnauthorized: false matches the declared posture rather than
 * relaxing it: encrypted in transit, no client-cert verification required.
 * Local/CI Postgres (Testcontainers, docker-compose) has no SSL at all.
 */
export function resolveDatabaseSsl(appEnv: string): { rejectUnauthorized: false } | undefined {
  return appEnv !== 'local' ? { rejectUnauthorized: false } : undefined;
}
