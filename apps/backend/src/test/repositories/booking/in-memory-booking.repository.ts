import { drainDomainEvents } from '../../../shared/infrastructure/outbox/drain-domain-events';
import { IOutboxPublisher } from '../../../shared/ports/outbox-publisher.port';
import {
  BookingFilters,
  BookingListFilters,
  BookingPaginatedResult,
  BookingResourceAssignmentSummary,
  IBookingRepository,
} from '../../../contexts/booking/application/ports/booking-repository.port';
import { Booking } from '../../../contexts/booking/domain/booking.aggregate';

export class InMemoryBookingRepository implements IBookingRepository {
  private readonly store = new Map<string, Booking>();
  private readonly resourceAssignmentsByBookingId = new Map<
    string,
    BookingResourceAssignmentSummary[]
  >();

  constructor(private readonly outboxPublisher: IOutboxPublisher = { publish: async () => {} }) {}

  // Test-only seeding hook — the real repository derives this from booking_line_resource_
  // assignments; this double has no such table, so a test that needs assignedResources populated
  // seeds it explicitly.
  setResourceAssignments(bookingId: string, assignments: BookingResourceAssignmentSummary[]): void {
    this.resourceAssignmentsByBookingId.set(bookingId, assignments);
  }

  findById(id: string, tenantId: string): Promise<Booking | null> {
    const booking = this.store.get(id);
    return Promise.resolve(booking?.tenantId === tenantId ? booking : null);
  }

  findByIds(ids: string[], tenantId: string): Promise<Booking[]> {
    const wanted = new Set(ids);
    return Promise.resolve(
      Array.from(this.store.values()).filter((b) => b.tenantId === tenantId && wanted.has(b.id)),
    );
  }

  findFutureActiveByRecurringSchedule(
    tenantId: string,
    recurringScheduleId: string,
    after: Date,
  ): Promise<Booking[]> {
    const nonTerminal = new Set(['PENDING', 'INFO_REQUESTED', 'APPROVED']);
    return Promise.resolve(
      Array.from(this.store.values()).filter(
        (b) =>
          b.tenantId === tenantId &&
          b.recurringScheduleId === recurringScheduleId &&
          b.scheduledAt.getTime() >= after.getTime() &&
          nonTerminal.has(b.status),
      ),
    );
  }

  findAllByTenant(tenantId: string, filters: BookingFilters = {}): Promise<Booking[]> {
    let results = Array.from(this.store.values()).filter((b) => b.tenantId === tenantId);
    if (filters.status?.length) results = results.filter((b) => filters.status!.includes(b.status));
    if (filters.customerId) results = results.filter((b) => b.customerId === filters.customerId);
    if (filters.recurringScheduleId) {
      results = results.filter((b) => b.recurringScheduleId === filters.recurringScheduleId);
    }
    if (filters.scheduledAfter)
      results = results.filter((b) => b.scheduledAt >= filters.scheduledAfter!);
    if (filters.scheduledBefore)
      results = results.filter((b) => b.scheduledAt <= filters.scheduledBefore!);
    return Promise.resolve(results);
  }

  async findAllByTenantPaginated(
    tenantId: string,
    filters: BookingListFilters,
  ): Promise<BookingPaginatedResult> {
    const all = await this.findAllByTenant(tenantId, filters);
    const total = all.length;
    return {
      items: all.slice(filters.offset, filters.offset + filters.limit),
      total,
      resourceAssignmentsByBookingId: this.resourceAssignmentsByBookingId,
    };
  }

  async save(booking: Booking): Promise<void> {
    this.store.set(booking.id, booking);
    await drainDomainEvents(booking, this.outboxPublisher);
  }

  existsByServiceId(serviceId: string, tenantId: string): Promise<boolean> {
    return Promise.resolve(
      Array.from(this.store.values()).some(
        (booking) =>
          booking.tenantId === tenantId &&
          booking.lines.some((line) => line.serviceId === serviceId),
      ),
    );
  }
}
