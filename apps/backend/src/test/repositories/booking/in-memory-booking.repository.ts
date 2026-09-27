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

  async findById(id: string, tenantId: string): Promise<Booking | null> {
    const booking = this.store.get(id);
    if (booking?.tenantId !== tenantId) return null;
    return booking ?? null;
  }

  async findByRecurringScheduleAndOccurrence(
    tenantId: string,
    recurringScheduleId: string,
    occurrenceStart: Date,
  ): Promise<Booking | null> {
    return (
      Array.from(this.store.values()).find(
        (b) =>
          b.tenantId === tenantId &&
          b.recurringScheduleId === recurringScheduleId &&
          b.scheduledAt.getTime() === occurrenceStart.getTime(),
      ) ?? null
    );
  }

  async findFutureActiveByRecurringSchedule(
    tenantId: string,
    recurringScheduleId: string,
    after: Date,
  ): Promise<Booking[]> {
    const nonTerminal: string[] = ['PENDING', 'INFO_REQUESTED', 'APPROVED'];
    return Array.from(this.store.values()).filter(
      (b) =>
        b.tenantId === tenantId &&
        b.recurringScheduleId === recurringScheduleId &&
        b.scheduledAt.getTime() >= after.getTime() &&
        nonTerminal.includes(b.status),
    );
  }

  async findAllByTenant(tenantId: string, filters: BookingFilters = {}): Promise<Booking[]> {
    let results = Array.from(this.store.values()).filter((b) => b.tenantId === tenantId);
    if (filters.status?.length) results = results.filter((b) => filters.status!.includes(b.status));
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

  async existsByServiceId(serviceId: string, tenantId: string): Promise<boolean> {
    return Array.from(this.store.values()).some(
      (booking) =>
        booking.tenantId === tenantId && booking.lines.some((line) => line.serviceId === serviceId),
    );
  }
}
