import { IScheduleClosureRepository } from '../../../contexts/booking/application/ports/schedule-closure-repository.port';
import { ScheduleClosure } from '../../../contexts/booking/domain/schedule-closure.aggregate';

export class InMemoryScheduleClosureRepository implements IScheduleClosureRepository {
  private store: ScheduleClosure[] = [];
  // Lets a spec assert a check's query count does not grow with occurrences or resources.
  rangeQueryCount = 0;
  resourcesRangeQueryCount = 0;

  async findByTenantAndDateRange(
    tenantId: string,
    from: string,
    to: string,
    resourceId?: string,
  ): Promise<ScheduleClosure[]> {
    this.rangeQueryCount += 1;
    return this.store
      .filter(
        (c) =>
          c.tenantId === tenantId &&
          c.date.value >= from &&
          c.date.value <= to &&
          c.resourceId === (resourceId ?? null),
      )
      .sort(
        (a, b) =>
          a.date.value.localeCompare(b.date.value) ||
          (a.startTime?.value ?? '').localeCompare(b.startTime?.value ?? ''),
      );
  }

  async findByTenantAndResourcesAndDateRange(
    tenantId: string,
    resourceIds: string[],
    from: string,
    to: string,
  ): Promise<ScheduleClosure[]> {
    this.resourcesRangeQueryCount += 1;
    return this.store
      .filter(
        (c) =>
          c.tenantId === tenantId &&
          c.date.value >= from &&
          c.date.value <= to &&
          c.resourceId !== null &&
          resourceIds.includes(c.resourceId),
      )
      .sort(
        (a, b) =>
          a.date.value.localeCompare(b.date.value) ||
          (a.startTime?.value ?? '').localeCompare(b.startTime?.value ?? ''),
      );
  }

  async findByTenantAndDate(
    tenantId: string,
    date: string,
    resourceId?: string,
  ): Promise<ScheduleClosure[]> {
    return this.store
      .filter(
        (c) =>
          c.tenantId === tenantId && c.date.value === date && c.resourceId === (resourceId ?? null),
      )
      .sort((a, b) => (a.startTime?.value ?? '').localeCompare(b.startTime?.value ?? ''));
  }

  async findById(id: string, tenantId: string): Promise<ScheduleClosure | null> {
    return this.store.find((c) => c.id === id && c.tenantId === tenantId) ?? null;
  }

  async save(closure: ScheduleClosure): Promise<void> {
    const idx = this.store.findIndex((c) => c.id === closure.id);
    if (idx >= 0) {
      this.store[idx] = closure;
    } else {
      this.store.push(closure);
    }
  }

  async delete(id: string, tenantId: string): Promise<void> {
    this.store = this.store.filter((c) => !(c.id === id && c.tenantId === tenantId));
  }

  clear(): void {
    this.store = [];
  }
}
