export const TENANT_LOCK_PORT = Symbol('ITenantLockPort');

export interface ITenantLockPort {
  // Acquires a transaction-scoped advisory lock scoped to (tenantId, date). Must be called from
  // inside an active ITransactionManager.run() block — the lock is released automatically when
  // that transaction commits or rolls back. Serializes any check-then-write sequence that reads
  // this call's competing counterpart against the same (tenantId, date) key.
  lockTenantDay(tenantId: string, date: string): Promise<void>;
  // Acquires a transaction-scoped advisory lock scoped to tenantId alone (not date — a Tenant's
  // settings, e.g. businessHours, aren't tied to one calendar date). Same call/release semantics
  // as lockTenantDay. Used to serialize a tenant's settings write against any read that must not
  // observe a stale value mid-write (e.g. a booking-context use case validating against
  // businessHours).
  lockTenantSettings(tenantId: string): Promise<void>;
}
