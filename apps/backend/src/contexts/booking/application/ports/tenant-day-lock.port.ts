export const TENANT_DAY_LOCK_PORT = Symbol('ITenantDayLockPort');

export interface ITenantDayLockPort {
  // Acquires a transaction-scoped advisory lock scoped to (tenantId, date). Must be called from
  // inside an active ITransactionManager.run() block — the lock is released automatically when
  // that transaction commits or rolls back. Serializes any check-then-write sequence that reads
  // this call's competing counterpart against the same (tenantId, date) key.
  lockTenantDay(tenantId: string, date: string): Promise<void>;
}
