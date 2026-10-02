import { BookingStatusTransition } from '../../domain/booking-status-transition';

export const BOOKING_STATUS_TRANSITION_REPOSITORY = Symbol('IBookingStatusTransitionRepository');

export interface IBookingStatusTransitionRepository {
  // Named save() (not append()/insert()) so architecture-check's transactional-save detector
  // enforces this call stays textually inside txManager.run() with the booking's own save().
  save(transition: BookingStatusTransition): Promise<void>;
}
