import { ScheduleOpening } from '../../domain/schedule-opening.aggregate';

export const SCHEDULE_OPENING_REPOSITORY = Symbol('IScheduleOpeningRepository');

export interface IScheduleOpeningRepository {
  findByTenantAndDate(
    tenantId: string,
    date: string,
    resourceId?: string,
  ): Promise<ScheduleOpening | null>;
  findByTenantAndDateRange(
    tenantId: string,
    from: string,
    to: string,
    resourceId?: string,
  ): Promise<ScheduleOpening[]>;
  findById(id: string, tenantId: string): Promise<ScheduleOpening | null>;
  /** True if at least one resource-scoped opening exists for (tenantId, date), regardless of
   * which resource — used to block deleting the tenant-wide opening they depend on
   * (docs/13-DATABASE_SCHEMA.md § schedule_openings Rules). */
  existsResourceScopedForDate(tenantId: string, date: string): Promise<boolean>;
  save(opening: ScheduleOpening): Promise<void>;
  delete(id: string, tenantId: string): Promise<void>;
}
