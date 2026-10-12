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
  // Counts every currently-ACTIVE RESOLVE_PER_OCCURRENCE schedule for this service — used for the
  // MAX_ACTIVE_RESOLVE_PER_OCCURRENCE_SCHEDULES_PER_SERVICE cap check. Must be called from inside
  // the same transaction as the ITenantLockPort.lockService() acquisition that precedes it.
  countActiveResolvePerOccurrenceByService(tenantId: string, serviceId: string): Promise<number>;
  // The expiry job's two reads, both tenant-scoped (the (tenant_id, status, ...) indexes serve them).
  // Aggregates come back without their resource assignments — the job only changes status.
  findPendingApprovalExpired(tenantId: string, now: Date): Promise<RecurringBookingSchedule[]>;
  // ACTIVE schedules whose last day (endsOn, a tenant-local calendar date) is before localToday.
  findActiveEndedBefore(tenantId: string, localToday: string): Promise<RecurringBookingSchedule[]>;
  // M23-S21: ACTIVE schedules whose last day (endsOn) is exactly this tenant-local date.
  findActiveEndingOn(tenantId: string, endsOn: string): Promise<RecurringBookingSchedule[]>;
  // M23-S21: the ids, among these schedules, that already have a successor — another ACTIVE or
  // PENDING_APPROVAL schedule of the same customer for the same service starting on or after the
  // schedule's endsOn. One tenant-scoped read for the whole batch, never one per schedule.
  findSuccessorScheduleIds(
    tenantId: string,
    schedules: readonly RecurringBookingSchedule[],
  ): Promise<Set<string>>;
  save(schedule: RecurringBookingSchedule): Promise<void>;
}
