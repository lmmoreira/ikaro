import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import { RecurringBookingScheduleStatus } from '../../domain/recurring-booking-schedule.types';

export const RECURRING_BOOKING_SCHEDULE_REPOSITORY = Symbol('IRecurringBookingScheduleRepository');

export interface RecurringBookingScheduleListFilters {
  customerId?: string;
  status?: RecurringBookingScheduleStatus;
  limit: number;
  offset: number;
}

export interface RecurringBookingSchedulePaginatedResult {
  items: RecurringBookingSchedule[];
  total: number;
}

export interface IRecurringBookingScheduleRepository {
  findById(id: string, tenantId: string): Promise<RecurringBookingSchedule | null>;
  findAllByTenantPaginated(
    tenantId: string,
    filters: RecurringBookingScheduleListFilters,
  ): Promise<RecurringBookingSchedulePaginatedResult>;
  // Counts every currently-ACTIVE FIXED_ASSIGNMENT schedule referencing this resourceId — used
  // for the MAX_ACTIVE_SCHEDULES_PER_RESOURCE cap check. Must be called from inside the same
  // transaction as the ITenantLockPort.lockResources() acquisition that precedes it (via
  // BookingSlotConflictService.assertSlotFree()) so the count-then-insert sequence is race-safe.
  countActiveByResource(tenantId: string, resourceId: string): Promise<number>;
  // Every currently-ACTIVE FIXED_ASSIGNMENT schedule referencing this resourceId — used for the
  // future-pattern-conflict check against *other* not-yet-materialized recurring schedules
  // (docs/13-DATABASE_SCHEMA.md's not-yet-materialized-pattern protocol): an ACTIVE schedule has
  // zero materialized Booking/resource_occupancy rows until M23-S05's generation job runs, so
  // resource_occupancy alone can never catch two overlapping recurring patterns — this direct
  // schedule-to-schedule comparison is the only mechanism that can, pre-S05. Same locking
  // requirement as countActiveByResource above.
  findActiveByResource(tenantId: string, resourceId: string): Promise<RecurringBookingSchedule[]>;
  // Counts every currently-ACTIVE RESOLVE_PER_OCCURRENCE schedule for this service — used for the
  // MAX_ACTIVE_RESOLVE_PER_OCCURRENCE_SCHEDULES_PER_SERVICE cap check. Must be called from inside
  // the same transaction as the ITenantLockPort.lockService() acquisition that precedes it.
  countActiveResolvePerOccurrenceByService(tenantId: string, serviceId: string): Promise<number>;
  save(schedule: RecurringBookingSchedule): Promise<void>;
}
