import { BookingStatusTransition } from '../../domain/booking-status-transition';

export const BOOKING_STATUS_TRANSITION_REPOSITORY = Symbol('IBookingStatusTransitionRepository');

export interface IBookingStatusTransitionRepository {
  // Called only by IBookingRepository.save(), inside the booking's own transaction.
  saveAll(transitions: BookingStatusTransition[]): Promise<void>;

  // A booking's full status history, tenant-scoped, oldest first: `occurred_at`, then the
  // time-ordered UUIDv7 `id` as tiebreak (the order the aggregate's rows are written in).
  findByBooking(tenantId: string, bookingId: string): Promise<BookingStatusTransition[]>;
}
