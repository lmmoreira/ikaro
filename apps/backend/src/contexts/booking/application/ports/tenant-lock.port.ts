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

  // Acquires one transaction-scoped advisory lock per resourceId, in the CALLER-independent
  // canonical order the adapter itself enforces (sorted ascending) — mirrors the
  // lockBookingModels() batched-row-lock precedent's "fixed order regardless of caller array
  // order" discipline, adapted to advisory locks (which have no batched multi-key primitive of
  // their own, unlike a single `SELECT ... FOR UPDATE`). Narrows the race window around
  // BookingSlotConflictService's resource_occupancy conflict pre-check; the GIST exclusion
  // constraint on resource_occupancy remains the authoritative backstop regardless (M22-S03,
  // docs/ENGINEERING_RULES_BACKEND.md § Choosing a race-condition primitive).
  lockResources(tenantId: string, resourceIds: string[]): Promise<void>;

  // Acquires a transaction-scoped advisory lock scoped to (tenantId, serviceId). Same contract as
  // lockTenantStaff — must be called from inside an active ITransactionManager.run() block,
  // released automatically on commit/rollback. Used by RESOLVE_PER_OCCURRENCE recurring-schedule
  // requests (M23-S04), which have no concrete resourceId to lock at request time (per-occurrence
  // resolution happens fresh at generation, M23-S05) — serializes the
  // MAX_ACTIVE_RESOLVE_PER_OCCURRENCE_SCHEDULES_PER_SERVICE cap check against a concurrent request
  // for the same service. Brand-new key, free to namespace.
  lockService(tenantId: string, serviceId: string): Promise<void>;

  // Acquires a transaction-scoped advisory lock scoped to (tenantId, customerId)'s availability
  // alerts. Same contract as lockService — inside an active ITransactionManager.run() block,
  // released on commit/rollback. No alert row exists yet at create time, so this is the
  // primitive that serializes the per-customer active-alert cap's count-then-insert against a
  // concurrent create by the same customer (M23-S06). Brand-new key, free to namespace.
  lockCustomerAlerts(tenantId: string, customerId: string): Promise<void>;
}
