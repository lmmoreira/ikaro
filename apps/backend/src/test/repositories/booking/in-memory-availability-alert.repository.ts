import { drainDomainEvents } from '../../../shared/infrastructure/outbox/drain-domain-events';
import { IOutboxPublisher } from '../../../shared/ports/outbox-publisher.port';
import { IAvailabilityAlertRepository } from '../../../contexts/booking/application/ports/availability-alert-repository.port';
import { AvailabilityAlert } from '../../../contexts/booking/domain/availability-alert.aggregate';
import { AvailabilityAlertNotificationAttempt } from '../../../contexts/booking/domain/availability-alert.types';

export class InMemoryAvailabilityAlertRepository implements IAvailabilityAlertRepository {
  private readonly store = new Map<string, AvailabilityAlert>();
  // The notification attempts persisted by save() — what the TypeORM adapter writes to
  // availability_alert_notification_attempts.
  readonly attempts: AvailabilityAlertNotificationAttempt[] = [];

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

  // Same order as the TypeORM adapter: createdAt ASC, id ASC.
  findActiveByService(
    tenantId: string,
    serviceId: string,
    now: Date,
  ): Promise<AvailabilityAlert[]> {
    return Promise.resolve(
      Array.from(this.store.values())
        .filter(
          (a) =>
            a.tenantId === tenantId &&
            a.serviceId === serviceId &&
            a.status === 'ACTIVE' &&
            a.expiresAt > now,
        )
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1)),
    );
  }

  findServiceIdsWithActiveAlerts(tenantId: string, now: Date): Promise<string[]> {
    const ids = new Set(
      Array.from(this.store.values())
        .filter((a) => a.tenantId === tenantId && a.status === 'ACTIVE' && a.expiresAt > now)
        .map((a) => a.serviceId),
    );
    return Promise.resolve([...ids].sort((a, b) => a.localeCompare(b)));
  }

  deleteFinishedExpiredBefore(tenantId: string, cutoff: Date): Promise<number> {
    const doomed = Array.from(this.store.values()).filter(
      (a) => a.tenantId === tenantId && a.status !== 'ACTIVE' && a.expiresAt < cutoff,
    );
    for (const alert of doomed) this.store.delete(alert.id);
    return Promise.resolve(doomed.length);
  }

  async save(alert: AvailabilityAlert): Promise<void> {
    this.store.set(alert.id, alert);
    const attempt = alert.takePendingAttempt();
    if (attempt) this.attempts.push(attempt);
    await drainDomainEvents(alert, this.outboxPublisher);
  }
}
