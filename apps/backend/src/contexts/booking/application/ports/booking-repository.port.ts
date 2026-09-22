import { Booking, BookingStatus } from '../../domain/booking.aggregate';

export const BOOKING_REPOSITORY = Symbol('IBookingRepository');

export interface BookingFilters {
  status?: BookingStatus[];
  customerId?: string;
  scheduledAfter?: Date;
  scheduledBefore?: Date;
}

export interface BookingListFilters extends BookingFilters {
  limit: number;
  offset: number;
}

export interface BookingPaginatedResult {
  items: Booking[];
  total: number;
}

export interface IBookingRepository {
  findById(id: string, tenantId: string): Promise<Booking | null>;
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
