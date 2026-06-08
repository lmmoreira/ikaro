import {
  BookingLookupSummary,
  IBookingLookupPort,
} from '../../contexts/platform/application/ports/booking-lookup.port';

export class InMemoryBookingLookupPort implements IBookingLookupPort {
  private readonly store = new Map<string, BookingLookupSummary>();

  async findById(bookingId: string, tenantId: string): Promise<BookingLookupSummary | null> {
    return this.store.get(`${tenantId}:${bookingId}`) ?? null;
  }

  setBooking(tenantId: string, summary: BookingLookupSummary): void {
    this.store.set(`${tenantId}:${summary.id}`, summary);
  }
}
