import { BookingStatusTransition } from '../../domain/booking-status-transition';

export const BOOKING_STATUS_TRANSITION_REPOSITORY = Symbol('IBookingStatusTransitionRepository');

export interface IBookingStatusTransitionRepository {
  // Called only by IBookingRepository.save(), inside the booking's own transaction.
  saveAll(transitions: BookingStatusTransition[]): Promise<void>;
}
