// What a repository returns for the BOOKING-removal guard (M26-S18a): the exact number of
// commitments that reach the removal's effective date plus a bounded, deterministically ordered
// sample of them. A projection of ids and dates, never the aggregates: a tenant can hold many
// live bookings, and loading each one to count it would grow with the tenant.
export interface FeatureRemovalBlockerPage<T> {
  total: number;
  sample: T[];
}

export interface BookingRemovalBlocker {
  id: string;
  scheduledEndAt: Date;
}

export interface ScheduleRemovalBlocker {
  id: string;
  // The schedule's last day, a tenant-local YYYY-MM-DD calendar date.
  endsOn: string;
}
