import { drainDomainEvents } from '../../../shared/infrastructure/outbox/drain-domain-events';
import { IOutboxPublisher } from '../../../shared/ports/outbox-publisher.port';
import { IAvailabilityAlertRepository } from '../../../contexts/booking/application/ports/availability-alert-repository.port';
import { AvailabilityAlert } from '../../../contexts/booking/domain/availability-alert.aggregate';

export class InMemoryAvailabilityAlertRepository implements IAvailabilityAlertRepository {
  private readonly store = new Map<string, AvailabilityAlert>();

  constructor(private readonly outboxPublisher: IOutboxPublisher = { publish: async () => {} }) {}

  seed(alert: AvailabilityAlert): void {
    this.store.set(alert.id, alert);
  }

  findById(id: string, tenantId: string): Promise<AvailabilityAlert | null> {
    const alert = this.store.get(id);
    return Promise.resolve(alert?.tenantId === tenantId ? alert : null);
  }

  // Same order as the TypeORM adapter: createdAt DESC, id DESC as the tie-breaker.
  findByCustomer(
    tenantId: string,
    customerId: string,
    limit: number,
  ): Promise<AvailabilityAlert[]> {
    return Promise.resolve(
      Array.from(this.store.values())
        .filter((a) => a.tenantId === tenantId && a.customerId === customerId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
        .slice(0, limit),
    );
  }

  countActiveByCustomer(tenantId: string, customerId: string): Promise<number> {
    return Promise.resolve(
      Array.from(this.store.values()).filter(
        (a) => a.tenantId === tenantId && a.customerId === customerId && a.status === 'ACTIVE',
      ).length,
    );
  }

  findActiveExpired(tenantId: string, now: Date): Promise<AvailabilityAlert[]> {
    return Promise.resolve(
      Array.from(this.store.values()).filter(
        (a) => a.tenantId === tenantId && a.status === 'ACTIVE' && a.expiresAt <= now,
      ),
    );
  }

  async save(alert: AvailabilityAlert): Promise<void> {
    this.store.set(alert.id, alert);
    await drainDomainEvents(alert, this.outboxPublisher);
  }
}
