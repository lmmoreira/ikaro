import { IScheduleClosureRepository } from '../../../contexts/booking/application/ports/schedule-closure-repository.port';
import { ScheduleClosure } from '../../../contexts/booking/domain/schedule-closure.aggregate';

// Methods return Promise.resolve(...) rather than being `async`: nothing here awaits, and an
// `async` method with no `await` is SonarCloud S7503.
export class InMemoryScheduleClosureRepository implements IScheduleClosureRepository {
  private store: ScheduleClosure[] = [];
  // Lets a spec assert a check's query count does not grow with occurrences or resources.
  rangeQueryCount = 0;
  resourcesRangeQueryCount = 0;

  findByTenantAndDateRange(
    tenantId: string,
    from: string,
    to: string,
    resourceId?: string,
  ): Promise<ScheduleClosure[]> {
    this.rangeQueryCount += 1;
    return Promise.resolve(
      this.store
        .filter(
          (c) =>
            c.tenantId === tenantId &&
            c.date.value >= from &&
            c.date.value <= to &&
            c.resourceId === (resourceId ?? null),
        )
        .sort(byDateThenStartTime),
    );
  }

  findByTenantAndResourcesAndDateRange(
    tenantId: string,
    resourceIds: string[],
    from: string,
    to: string,
  ): Promise<ScheduleClosure[]> {
    this.resourcesRangeQueryCount += 1;
    return Promise.resolve(
      this.store
        .filter(
          (c) =>
            c.tenantId === tenantId &&
            c.date.value >= from &&
            c.date.value <= to &&
            c.resourceId !== null &&
            resourceIds.includes(c.resourceId),
        )
        .sort(byDateThenStartTime),
    );
  }

  findByTenantAndDate(
    tenantId: string,
    date: string,
    resourceId?: string,
  ): Promise<ScheduleClosure[]> {
    return Promise.resolve(
      this.store
        .filter(
          (c) =>
            c.tenantId === tenantId &&
            c.date.value === date &&
            c.resourceId === (resourceId ?? null),
        )
        .sort((a, b) => (a.startTime?.value ?? '').localeCompare(b.startTime?.value ?? '')),
    );
  }

  findById(id: string, tenantId: string): Promise<ScheduleClosure | null> {
    return Promise.resolve(this.store.find((c) => c.id === id && c.tenantId === tenantId) ?? null);
  }

  save(closure: ScheduleClosure): Promise<void> {
    const idx = this.store.findIndex((c) => c.id === closure.id);
    if (idx >= 0) {
      this.store[idx] = closure;
    } else {
      this.store.push(closure);
    }
    return Promise.resolve();
  }

  delete(id: string, tenantId: string): Promise<void> {
    this.store = this.store.filter((c) => !(c.id === id && c.tenantId === tenantId));
    return Promise.resolve();
  }

  clear(): void {
    this.store = [];
  }
}

function byDateThenStartTime(a: ScheduleClosure, b: ScheduleClosure): number {
  return (
    a.date.value.localeCompare(b.date.value) ||
    (a.startTime?.value ?? '').localeCompare(b.startTime?.value ?? '')
  );
}
