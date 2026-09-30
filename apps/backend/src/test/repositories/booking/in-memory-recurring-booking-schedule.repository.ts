import { drainDomainEvents } from '../../../shared/infrastructure/outbox/drain-domain-events';
import { IOutboxPublisher } from '../../../shared/ports/outbox-publisher.port';
import {
  IRecurringBookingScheduleRepository,
  RecurringBookingScheduleListFilters,
  RecurringBookingSchedulePaginatedResult,
} from '../../../contexts/booking/application/ports/recurring-booking-schedule-repository.port';
import { RecurringBookingSchedule } from '../../../contexts/booking/domain/recurring-booking-schedule.aggregate';

export class InMemoryRecurringBookingScheduleRepository implements IRecurringBookingScheduleRepository {
  private readonly store = new Map<string, RecurringBookingSchedule>();

  constructor(private readonly outboxPublisher: IOutboxPublisher = { publish: async () => {} }) {}

  seed(schedule: RecurringBookingSchedule): void {
    this.store.set(schedule.id, schedule);
  }

  findById(id: string, tenantId: string): Promise<RecurringBookingSchedule | null> {
    const schedule = this.store.get(id);
    return Promise.resolve(schedule?.tenantId === tenantId ? schedule : null);
  }

  findAllByTenantPaginated(
    tenantId: string,
    filters: RecurringBookingScheduleListFilters,
  ): Promise<RecurringBookingSchedulePaginatedResult> {
    let results = Array.from(this.store.values()).filter((s) => s.tenantId === tenantId);
    if (filters.customerId) results = results.filter((s) => s.customerId === filters.customerId);
    if (filters.status) results = results.filter((s) => s.status === filters.status);
    // Same order as the TypeORM adapter: createdAt DESC, id DESC as the tie-breaker.
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1));
    return Promise.resolve({
      items: results.slice(filters.offset, filters.offset + filters.limit),
      total: results.length,
    });
  }

  countActiveByResource(tenantId: string, resourceId: string): Promise<number> {
    return Promise.resolve(
      Array.from(this.store.values()).filter(
        (s) =>
          s.tenantId === tenantId &&
          s.status === 'ACTIVE' &&
          s.assignmentPolicy === 'FIXED_ASSIGNMENT' &&
          s.resourceAssignments.some((a) => a.resourceId === resourceId),
      ).length,
    );
  }

  countActiveResolvePerOccurrenceByService(tenantId: string, serviceId: string): Promise<number> {
    return Promise.resolve(
      Array.from(this.store.values()).filter(
        (s) =>
          s.tenantId === tenantId &&
          s.serviceId === serviceId &&
          s.status === 'ACTIVE' &&
          s.assignmentPolicy === 'RESOLVE_PER_OCCURRENCE',
      ).length,
    );
  }

  findPendingApprovalExpired(tenantId: string, now: Date): Promise<RecurringBookingSchedule[]> {
    return Promise.resolve(
      Array.from(this.store.values()).filter(
        (s) =>
          s.tenantId === tenantId &&
          s.status === 'PENDING_APPROVAL' &&
          s.approvalHoldExpiresAt !== null &&
          s.approvalHoldExpiresAt <= now,
      ),
    );
  }

  findActiveEndedBefore(tenantId: string, localToday: string): Promise<RecurringBookingSchedule[]> {
    return Promise.resolve(
      Array.from(this.store.values()).filter(
        (s) => s.tenantId === tenantId && s.status === 'ACTIVE' && s.endsOn < localToday,
      ),
    );
  }

  async save(schedule: RecurringBookingSchedule): Promise<void> {
    this.store.set(schedule.id, schedule);
    await drainDomainEvents(schedule, this.outboxPublisher);
  }
}
