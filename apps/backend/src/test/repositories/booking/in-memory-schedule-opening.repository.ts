import { IScheduleOpeningRepository } from '../../../contexts/booking/application/ports/schedule-opening-repository.port';
import { ScheduleOpening } from '../../../contexts/booking/domain/schedule-opening.aggregate';

// Methods return Promise.resolve(...) rather than being `async`: nothing here awaits, and an
// `async` method with no `await` is SonarCloud S7503.
export class InMemoryScheduleOpeningRepository implements IScheduleOpeningRepository {
  private store: ScheduleOpening[] = [];
  // Lets a spec assert a check's query count does not grow with occurrences or resources.
  rangeQueryCount = 0;
  resourcesRangeQueryCount = 0;

  findByTenantAndDate(
    tenantId: string,
    date: string,
    resourceId?: string,
  ): Promise<ScheduleOpening | null> {
    return Promise.resolve(
      this.store.find(
        (o) =>
          o.tenantId === tenantId && o.date.value === date && o.resourceId === (resourceId ?? null),
      ) ?? null,
    );
  }

  findByTenantAndDateRange(
    tenantId: string,
    from: string,
    to: string,
    resourceId?: string,
  ): Promise<ScheduleOpening[]> {
    this.rangeQueryCount += 1;
    return Promise.resolve(
      this.store
        .filter(
          (o) =>
            o.tenantId === tenantId &&
            o.date.value >= from &&
            o.date.value <= to &&
            o.resourceId === (resourceId ?? null),
        )
        .sort(byDate),
    );
  }

  findByTenantAndResourcesAndDateRange(
    tenantId: string,
    resourceIds: string[],
    from: string,
    to: string,
  ): Promise<ScheduleOpening[]> {
    this.resourcesRangeQueryCount += 1;
    return Promise.resolve(
      this.store
        .filter(
          (o) =>
            o.tenantId === tenantId &&
            o.date.value >= from &&
            o.date.value <= to &&
            o.resourceId !== null &&
            resourceIds.includes(o.resourceId),
        )
        .sort(byDate),
    );
  }

  findById(id: string, tenantId: string): Promise<ScheduleOpening | null> {
    return Promise.resolve(this.store.find((o) => o.id === id && o.tenantId === tenantId) ?? null);
  }

  existsResourceScopedForDate(tenantId: string, date: string): Promise<boolean> {
    return Promise.resolve(
      this.store.some(
        (o) => o.tenantId === tenantId && o.date.value === date && o.resourceId !== null,
      ),
    );
  }

  save(opening: ScheduleOpening): Promise<void> {
    const idx = this.store.findIndex((o) => o.id === opening.id);
    if (idx >= 0) {
      this.store[idx] = opening;
    } else {
      this.store.push(opening);
    }
    return Promise.resolve();
  }

  delete(id: string, tenantId: string): Promise<void> {
    this.store = this.store.filter((o) => !(o.id === id && o.tenantId === tenantId));
    return Promise.resolve();
  }

  clear(): void {
    this.store = [];
  }
}

function byDate(a: ScheduleOpening, b: ScheduleOpening): number {
  return a.date.value.localeCompare(b.date.value);
}
