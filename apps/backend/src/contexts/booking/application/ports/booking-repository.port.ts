import { Booking, BookingStatus } from '../../domain/booking.aggregate';
import { ResourceType } from '../../domain/resource.types';

export const BOOKING_REPOSITORY = Symbol('IBookingRepository');

export interface BookingFilters {
  status?: BookingStatus[];
  customerId?: string;
  // The occurrence bookings one recurring schedule materialized (M23-S08 — an occurrence is its
  // linked booking).
  recurringScheduleId?: string;
  scheduledAfter?: Date;
  scheduledBefore?: Date;
}

export interface BookingListFilters extends BookingFilters {
  limit: number;
  offset: number;
}

// A display-only projection of booking_line_resource_assignments (the immutable audit record —
// see docs/13-DATABASE_SCHEMA.md), deliberately kept out of the Booking aggregate itself: which
// physical resource a line resolved to has no bearing on Booking's own state-transition business
// rules, unlike `lines`, which the aggregate genuinely owns and reasons about (pricing, duration).
// One entry per physical resource per booking (deduplicated — a booking with the same resource
// assigned across multiple lines/legs lists it once, not once per line).
export interface BookingResourceAssignmentSummary {
  resourceId: string;
  resourceType: ResourceType;
  resourceName: string;
}

export interface BookingPaginatedResult {
  items: Booking[];
  total: number;
  resourceAssignmentsByBookingId: ReadonlyMap<string, readonly BookingResourceAssignmentSummary[]>;
}

export interface IBookingRepository {
  findById(id: string, tenantId: string): Promise<Booking | null>;
  // Batched load of full bookings by id (M23-S08's worklist read); ids that do not exist in the
  // tenant are simply absent from the result.
  findByIds(ids: string[], tenantId: string): Promise<Booking[]>;
  // Every future, still-active (non-terminal) occurrence materialized by a schedule — used by
  // EndRecurringBookingScheduleUseCase (M23-S04) to cancel them and release their resource_
  // occupancy rows. Empty before M23-S05 materializes any occurrence.
  findFutureActiveByRecurringSchedule(
    tenantId: string,
    recurringScheduleId: string,
    after: Date,
  ): Promise<Booking[]>;
  findAllByTenant(tenantId: string, filters?: BookingFilters): Promise<Booking[]>;
  findAllByTenantPaginated(
    tenantId: string,
    filters: BookingListFilters,
  ): Promise<BookingPaginatedResult>;
  save(booking: Booking): Promise<void>;
  // Narrow existence check (M22-S01, UC-056 A1) — never fetches full booking rows, just whether
  // any booking line references this service, for the bookingModel-immutability check.
  existsByServiceId(serviceId: string, tenantId: string): Promise<boolean>;
}
