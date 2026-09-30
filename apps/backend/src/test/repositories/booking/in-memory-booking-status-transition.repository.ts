import { IBookingStatusTransitionRepository } from '../../../contexts/booking/application/ports/booking-status-transition-repository.port';
import { BookingStatusTransition } from '../../../contexts/booking/domain/booking-status-transition';

export class InMemoryBookingStatusTransitionRepository implements IBookingStatusTransitionRepository {
  private readonly store: BookingStatusTransition[] = [];

  async save(transition: BookingStatusTransition): Promise<void> {
    this.store.push(transition);
  }

  // Test-only accessor — not part of the port.
  all(): BookingStatusTransition[] {
    return [...this.store];
  }
}
