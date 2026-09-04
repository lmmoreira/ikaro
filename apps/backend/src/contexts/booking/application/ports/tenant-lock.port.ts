export const TENANT_LOCK_PORT = Symbol('ITenantLockPort');

export interface ITenantLockPort {
  // Acquires a transaction-scoped advisory lock scoped to (tenantId, date). Must be called from
  // inside an active ITransactionManager.run() block — the lock is released automatically when
  // that transaction commits or rolls back. Serializes any check-then-write sequence that reads
  // this call's competing counterpart against the same (tenantId, date) key.
  lockTenantDay(tenantId: string, date: string): Promise<void>;

  // Acquires a transaction-scoped advisory lock scoped to (tenantId, staffId). Same contract as
  // lockTenantDay — must be called from inside an active ITransactionManager.run() block, released
  // automatically on commit/rollback. Serializes a STAFF-type Resource create/update/reactivate
  // against a concurrent StaffDeactivated cascade for the same staff member (M21-S06).
  lockTenantStaff(tenantId: string, staffId: string): Promise<void>;
}
