import { Booking, BookingStatus } from '../../domain/booking.aggregate';

export const BOOKING_REPOSITORY = Symbol('IBookingRepository');

export interface BookingFilters {
  status?: BookingStatus;
  customerId?: string;
  scheduledAfter?: Date;
  scheduledBefore?: Date;
}

export interface IBookingRepository {
  findById(id: string, tenantId: string): Promise<Booking | null>;
  findAllByTenant(tenantId: string, filters?: BookingFilters): Promise<Booking[]>;
  save(booking: Booking): Promise<void>;
}
