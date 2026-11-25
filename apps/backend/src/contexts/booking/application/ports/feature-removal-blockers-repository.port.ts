import type {
  BookingRemovalBlocker,
  FeatureRemovalBlockerPage,
  ScheduleRemovalBlocker,
} from './feature-removal-blockers.types';

export const FEATURE_REMOVAL_BLOCKERS_REPOSITORY = Symbol('IFeatureRemovalBlockersRepository');

// A read model for the BOOKING-removal guard (M26-S18a, UC-136 A11), kept apart from the aggregate
// repositories on purpose: it is a reporting read of ids and dates that no aggregate rule uses,
// and it must stay light enough for Billing to wire in without Booking's whole persistence layer.
// Both reads are tenant-scoped, never load an aggregate, and return the exact total plus a bounded
// sample ordered by date then id.
export interface IFeatureRemovalBlockersRepository {
  // The PENDING / INFO_REQUESTED / APPROVED bookings whose end is strictly after `endsAfter` (the
  // UTC instant `effectiveDate` starts at in the tenant's timezone). An occurrence of a schedule
  // that `findSchedulesEndingOnOrAfter(effectiveDate)` itself counts (PENDING_APPROVAL / ACTIVE,
  // `endsOn >= effectiveDate`) is left out: that schedule is counted once on its own. An
  // occurrence of any other schedule stays a booking, so a final occurrence on the schedule's last
  // day that runs past midnight into the effective date is never dropped from both counts.
  // `sampleLimit` is at least 1.
  findBookingsEndingAfter(
    tenantId: string,
    endsAfter: Date,
    effectiveDate: string,
    sampleLimit: number,
  ): Promise<FeatureRemovalBlockerPage<BookingRemovalBlocker>>;
  // The PENDING_APPROVAL / ACTIVE recurring schedules whose last day (`endsOn`, a tenant-local
  // calendar date) is on or after `effectiveDate`.
  findSchedulesEndingOnOrAfter(
    tenantId: string,
    effectiveDate: string,
    sampleLimit: number,
  ): Promise<FeatureRemovalBlockerPage<ScheduleRemovalBlocker>>;
}
