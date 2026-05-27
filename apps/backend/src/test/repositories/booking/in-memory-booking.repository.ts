import {
  BookingFilters,
  BookingListFilters,
  BookingPaginatedResult,
  IBookingRepository,
} from '../../../contexts/booking/application/ports/booking-repository.port';
import { Booking } from '../../../contexts/booking/domain/booking.aggregate';

export class InMemoryBookingRepository implements IBookingRepository {
  private readonly store = new Map<string, Booking>();

  async findById(id: string, tenantId: string): Promise<Booking | null> {
    const booking = this.store.get(id);
    if (booking?.tenantId !== tenantId) return null;
    return booking ?? null;
  }

  async findAllByTenant(tenantId: string, filters: BookingFilters = {}): Promise<Booking[]> {
    let results = Array.from(this.store.values()).filter((b) => b.tenantId === tenantId);
    if (filters.status) results = results.filter((b) => b.status === filters.status);
    if (filters.customerId) results = results.filter((b) => b.customerId === filters.customerId);
    if (filters.scheduledAfter)
      results = results.filter((b) => b.scheduledAt >= filters.scheduledAfter!);
    if (filters.scheduledBefore)
      results = results.filter((b) => b.scheduledAt <= filters.scheduledBefore!);
    return results;
  }

  async findAllByTenantPaginated(
    tenantId: string,
    filters: BookingListFilters,
  ): Promise<BookingPaginatedResult> {
    const all = await this.findAllByTenant(tenantId, filters);
    const total = all.length;
    return { items: all.slice(filters.offset, filters.offset + filters.limit), total };
  }

  async save(booking: Booking): Promise<void> {
    this.store.set(booking.id, booking);
  }
}
