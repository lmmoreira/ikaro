import { drainDomainEvents } from '../../../shared/infrastructure/outbox/drain-domain-events';
import { IOutboxPublisher } from '../../../shared/ports/outbox-publisher.port';
import {
  FutureCommitmentExceptionFilters,
  FutureCommitmentExceptionImpact,
  IFutureCommitmentExceptionRepository,
} from '../../../contexts/booking/application/ports/future-commitment-exception-repository.port';
import { FutureCommitmentException } from '../../../contexts/booking/domain/future-commitment-exception.aggregate';

export class InMemoryFutureCommitmentExceptionRepository implements IFutureCommitmentExceptionRepository {
  private readonly store = new Map<string, FutureCommitmentException>();

  constructor(private readonly outboxPublisher: IOutboxPublisher = { publish: async () => {} }) {}

  seed(exception: FutureCommitmentException): void {
    this.store.set(exception.id, exception);
  }

  findById(id: string, tenantId: string): Promise<FutureCommitmentException | null> {
    const exception = this.store.get(id);
    return Promise.resolve(exception?.tenantId === tenantId ? exception : null);
  }

  // No real row lock in memory — the unit specs that need concurrency semantics are integration
  // specs against a real database.
  findByIdForUpdate(id: string, tenantId: string): Promise<FutureCommitmentException | null> {
    return this.findById(id, tenantId);
  }

  findOpenByImpact(
    tenantId: string,
    impact: FutureCommitmentExceptionImpact,
  ): Promise<FutureCommitmentException | null> {
    return Promise.resolve(
      Array.from(this.store.values()).find(
        (e) =>
          e.tenantId === tenantId &&
          e.status === 'OPEN' &&
          e.sourceType === impact.sourceType &&
          e.sourceId === impact.sourceId &&
          e.affectedType === impact.affectedType &&
          e.affectedId === impact.affectedId,
      ) ?? null,
    );
  }

  findByTenant(
    tenantId: string,
    filters: FutureCommitmentExceptionFilters = {},
  ): Promise<FutureCommitmentException[]> {
    return Promise.resolve(
      Array.from(this.store.values())
        .filter((e) => e.tenantId === tenantId && (!filters.status || e.status === filters.status))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1)),
    );
  }

  async save(exception: FutureCommitmentException): Promise<void> {
    this.store.set(exception.id, exception);
    await drainDomainEvents(exception, this.outboxPublisher);
  }
}
