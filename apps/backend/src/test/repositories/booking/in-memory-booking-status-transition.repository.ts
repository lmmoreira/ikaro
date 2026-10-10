import { IBookingStatusTransitionRepository } from '../../../contexts/booking/application/ports/booking-status-transition-repository.port';
import { BookingStatusTransition } from '../../../contexts/booking/domain/booking-status-transition';

export class InMemoryBookingStatusTransitionRepository implements IBookingStatusTransitionRepository {
  private readonly store: BookingStatusTransition[] = [];

  saveAll(transitions: BookingStatusTransition[]): Promise<void> {
    this.store.push(...transitions);
    return Promise.resolve();
  }

  findByBooking(tenantId: string, bookingId: string): Promise<BookingStatusTransition[]> {
    const rows = this.store
      .filter((t) => t.tenantId === tenantId && t.bookingId === bookingId)
      .sort(
        (a, b) =>
          a.occurredAt.getTime() - b.occurredAt.getTime() ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
    return Promise.resolve(rows);
  }

  // Test-only accessor — not part of the port.
  all(): BookingStatusTransition[] {
    return [...this.store];
  }
}
