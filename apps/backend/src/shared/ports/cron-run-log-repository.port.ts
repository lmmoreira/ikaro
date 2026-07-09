export const CRON_RUN_LOG_REPOSITORY = Symbol('CRON_RUN_LOG_REPOSITORY');

// Coarse per-tenant idempotency gate for cron jobs (M17-S03): a job invoked twice for the same
// tenant/date/reminderType (e.g. Pub/Sub at-least-once redelivery of the same trigger) skips
// reprocessing. Deliberately shared as a port only — the TypeORM entity/table is duplicated per
// context (booking, loyalty), matching the existing processed_events precedent, since each
// context owns its own schema-qualified table.
export interface ICronRunLogRepository {
  hasRun(tenantId: string, cronDate: string, reminderType: string): Promise<boolean>;
  markRun(tenantId: string, cronDate: string, reminderType: string): Promise<void>;
}
