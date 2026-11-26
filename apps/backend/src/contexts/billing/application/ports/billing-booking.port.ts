export const BILLING_BOOKING_PORT = Symbol('IBillingBookingPort');

export type BookingRemovalBlockerCategory = 'BOOKING' | 'RECURRING_SCHEDULE';

/** One thing that blocks the removal: an id and a date, never customer data (M26-S18a). */
export interface BookingRemovalBlocker {
  category: BookingRemovalBlockerCategory;
  id: string;
  /** YYYY-MM-DD, tenant-local: a booking's end day or a schedule's last day. */
  date: string;
}

/**
 * What removing the BOOKING feature on `effectiveFrom` would strand. The shape of the
 * `BILLING_FEATURE_IN_USE` `params` the plan save (M26-S19) returns. Availability alerts are never
 * counted: they hold no capacity and only the customer can cancel one.
 */
export interface BookingFeatureRemovalImpact {
  effectiveFrom: string;
  /** Live bookings (not an occurrence of a counted schedule) ending after the effective day starts. */
  bookings: number;
  /** PENDING_APPROVAL / ACTIVE recurring schedules whose last day is on or after the effective day. */
  recurringSchedules: number;
  /** At most 10, bookings first, each category ordered by date then id. */
  blockers: BookingRemovalBlocker[];
}

/**
 * Billing's one read of Booking (a permitted edge, read-only, never a SQL join): the guard of
 * UC-136 A11. The caller decides what a non-empty answer means; this port never throws for one.
 */
export interface IBillingBookingPort {
  getBookingFeatureRemovalImpact(
    tenantId: string,
    effectiveDate: string,
  ): Promise<BookingFeatureRemovalImpact>;
}
