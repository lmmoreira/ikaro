import { drainDomainEvents } from '../../../shared/infrastructure/outbox/drain-domain-events';
import { IOutboxPublisher } from '../../../shared/ports/outbox-publisher.port';
import {
  IRecurringBookingScheduleRepository,
  RecurringBookingScheduleListFilters,
} from '../../../contexts/booking/application/ports/recurring-booking-schedule-repository.port';
import { RecurringBookingSchedule } from '../../../contexts/booking/domain/recurring-booking-schedule.aggregate';

export class InMemoryRecurringBookingScheduleRepository implements IRecurringBookingScheduleRepository {
  private readonly store = new Map<string, RecurringBookingSchedule>();

  constructor(private readonly outboxPublisher: IOutboxPublisher = { publish: async () => {} }) {}

  seed(schedule: RecurringBookingSchedule): void {
    this.store.set(schedule.id, schedule);
  }

  async findById(id: string, tenantId: string): Promise<RecurringBookingSchedule | null> {
    const schedule = this.store.get(id);
    if (schedule?.tenantId !== tenantId) return null;
    return schedule;
  }

  async findAllByTenant(
    tenantId: string,
    filters: RecurringBookingScheduleListFilters,
  ): Promise<RecurringBookingSchedule[]> {
    let results = Array.from(this.store.values()).filter((s) => s.tenantId === tenantId);
    if (filters.customerId) results = results.filter((s) => s.customerId === filters.customerId);
    return results;
  }

  async countActiveByResource(tenantId: string, resourceId: string): Promise<number> {
    return Array.from(this.store.values()).filter(
      (s) =>
        s.tenantId === tenantId &&
        s.status === 'ACTIVE' &&
        s.assignmentPolicy === 'FIXED_ASSIGNMENT' &&
        s.resourceAssignments.some((a) => a.resourceId === resourceId),
    ).length;
  }

  async findActiveByResource(
    tenantId: string,
    resourceId: string,
  ): Promise<RecurringBookingSchedule[]> {
    return Array.from(this.store.values()).filter(
      (s) =>
        s.tenantId === tenantId &&
        s.status === 'ACTIVE' &&
        s.assignmentPolicy === 'FIXED_ASSIGNMENT' &&
        s.resourceAssignments.some((a) => a.resourceId === resourceId),
    );
  }

  async countActiveResolvePerOccurrenceByService(
    tenantId: string,
    serviceId: string,
  ): Promise<number> {
    return Array.from(this.store.values()).filter(
      (s) =>
        s.tenantId === tenantId &&
        s.serviceId === serviceId &&
        s.status === 'ACTIVE' &&
        s.assignmentPolicy === 'RESOLVE_PER_OCCURRENCE',
    ).length;
  }

  async save(schedule: RecurringBookingSchedule): Promise<void> {
    this.store.set(schedule.id, schedule);
    await drainDomainEvents(schedule, this.outboxPublisher);
  }
}
