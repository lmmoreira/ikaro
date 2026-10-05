import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, LessThanOrEqual, Repository } from 'typeorm';
import { drainDomainEvents } from '../../../../shared/infrastructure/outbox/drain-domain-events';
import { runInNewTransaction } from '../../../../shared/infrastructure/run-in-new-transaction';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { IOutboxPublisher, OUTBOX_PUBLISHER } from '../../../../shared/ports/outbox-publisher.port';
import { IAvailabilityAlertRepository } from '../../application/ports/availability-alert-repository.port';
import { AvailabilityAlert } from '../../domain/availability-alert.aggregate';
import { BookingConcurrentModificationError } from '../../domain/errors/booking-domain.error';
import { AvailabilityAlertEntity } from '../entities/availability-alert.entity';
import { toDomain, toEntity, toUpdateSet } from './typeorm-availability-alert.mapper';

@Injectable()
export class TypeOrmAvailabilityAlertRepository implements IAvailabilityAlertRepository {
  constructor(
    @InjectRepository(AvailabilityAlertEntity)
    private readonly repo: Repository<AvailabilityAlertEntity>,
    @Inject(OUTBOX_PUBLISHER) private readonly outboxPublisher: IOutboxPublisher,
  ) {}

  async findById(id: string, tenantId: string): Promise<AvailabilityAlert | null> {
    const entity = await this.repo.findOne({ where: { id, tenantId } });
    return entity ? toDomain(entity) : null;
  }

  // `id` is a tie-breaker: Postgres has no defined order among rows with equal ORDER BY keys.
  async findByCustomer(
    tenantId: string,
    customerId: string,
    limit: number,
  ): Promise<AvailabilityAlert[]> {
    const entities = await this.repo.find({
      where: { tenantId, customerId },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: limit,
    });
    return entities.map(toDomain);
  }

  async countActiveByCustomer(tenantId: string, customerId: string): Promise<number> {
    return this.repo.count({ where: { tenantId, customerId, status: 'ACTIVE' } });
  }

  async findActiveExpired(tenantId: string, now: Date): Promise<AvailabilityAlert[]> {
    const entities = await this.repo.find({
      where: { tenantId, status: 'ACTIVE', expiresAt: LessThanOrEqual(now) },
      order: { expiresAt: 'ASC', id: 'ASC' },
    });
    return entities.map(toDomain);
  }

  // The attempts go first (their composite FK points at the alert); both deletes share one
  // transaction, whether the caller opened one or not. Tenant-scoped, served by the
  // (tenant_id, status, expires_at) index.
  async deleteFinishedExpiredBefore(tenantId: string, cutoff: Date): Promise<number> {
    const manager = getActiveEntityManager();
    if (manager) return this.purge(manager, tenantId, cutoff);
    return runInNewTransaction(this.repo.manager, (tx) => this.purge(tx, tenantId, cutoff));
  }

  private async purge(manager: EntityManager, tenantId: string, cutoff: Date): Promise<number> {
    await manager.query(
      `DELETE FROM "booking"."availability_alert_notification_attempts"
       WHERE "tenant_id" = $1 AND "alert_id" IN (
         SELECT "id" FROM "booking"."availability_alerts"
         WHERE "tenant_id" = $1 AND "status" <> 'ACTIVE' AND "expires_at" < $2
       )`,
      [tenantId, cutoff],
    );
    const result = await manager
      .getRepository(AvailabilityAlertEntity)
      .createQueryBuilder()
      .delete()
      .where('tenant_id = :tenantId', { tenantId })
      .andWhere("status <> 'ACTIVE'")
      .andWhere('expires_at < :cutoff', { cutoff })
      .execute();
    return result.affected ?? 0;
  }

  async save(alert: AvailabilityAlert): Promise<void> {
    const manager = getActiveEntityManager();
    if (manager) {
      await this.persist(manager, alert);
    } else {
      // Self-managed transaction when the caller has no ambient txManager.run(): the ambient
      // context must point at this tx too, or drainDomainEvents' outbox write would run outside
      // it (mirrors typeorm-recurring-booking-schedule.repository.ts's save()).
      await runInNewTransaction(this.repo.manager, (tx) => this.persist(tx, alert));
    }
  }

  private async persist(manager: EntityManager, alert: AvailabilityAlert): Promise<void> {
    const alertRepo = manager.getRepository(AvailabilityAlertEntity);
    const entity = toEntity(alert);
    // version === undefined means a brand-new alert; anything else was read back and must be
    // optimistically version-checked on write.
    const nextVersion = alert.version === undefined ? 1 : alert.version + 1;

    if (alert.version === undefined) {
      await alertRepo.insert(entity);
    } else {
      const result = await alertRepo
        .createQueryBuilder()
        .update(AvailabilityAlertEntity)
        .set(toUpdateSet(entity))
        .where('id = :id', { id: alert.id })
        .andWhere('tenant_id = :tenantId', { tenantId: alert.tenantId })
        .andWhere('version = :version', { version: alert.version })
        .execute();
      if (result.affected !== 1) throw new BookingConcurrentModificationError();
    }

    await drainDomainEvents(alert, this.outboxPublisher);
    alert.markPersisted(nextVersion);
  }
}
