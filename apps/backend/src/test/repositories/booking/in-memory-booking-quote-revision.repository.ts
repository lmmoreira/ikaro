import { IBookingQuoteRevisionRepository } from '../../../contexts/booking/application/ports/booking-quote-revision-repository.port';
import { BookingQuoteRevision } from '../../../contexts/booking/domain/booking-quote-revision';

export class InMemoryBookingQuoteRevisionRepository implements IBookingQuoteRevisionRepository {
  private readonly store: BookingQuoteRevision[] = [];

  async findLatestRevisionNo(tenantId: string, bookingId: string): Promise<number> {
    const revisions = this.store.filter(
      (r) => r.tenantId === tenantId && r.bookingId === bookingId,
    );
    return revisions.length ? Math.max(...revisions.map((r) => r.revisionNo)) : 0;
  }

  async save(revision: BookingQuoteRevision): Promise<void> {
    this.store.push(revision);
  }

  // Test-only accessor — not part of the port.
  all(): BookingQuoteRevision[] {
    return [...this.store];
  }
}
