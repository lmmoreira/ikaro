import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import { drainDomainEvents } from '../../../../shared/infrastructure/outbox/drain-domain-events';
import { runInNewTransaction } from '../../../../shared/infrastructure/run-in-new-transaction';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { IOutboxPublisher, OUTBOX_PUBLISHER } from '../../../../shared/ports/outbox-publisher.port';
import { IAvailabilityAlertRepository } from '../../application/ports/availability-alert-repository.port';
import { AvailabilityAlert } from '../../domain/availability-alert.aggregate';
import {
  AvailabilityAlertAttemptOutcome,
  AvailabilityAlertMatchingWindow,
} from '../../domain/availability-alert.types';
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

  async findActiveByService(
    tenantId: string,
    serviceId: string,
    now: Date,
  ): Promise<AvailabilityAlert[]> {
    const entities = await this.repo.find({
      where: { tenantId, serviceId, status: 'ACTIVE', expiresAt: MoreThan(now) },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return entities.map(toDomain);
  }

  async findServiceIdsWithActiveAlerts(tenantId: string, now: Date): Promise<string[]> {
    const rows = await this.repo
      .createQueryBuilder('alert')
      .select('alert.service_id', 'serviceId')
      .where('alert.tenant_id = :tenantId', { tenantId })
      .andWhere("alert.status = 'ACTIVE'")
      .andWhere('alert.expires_at > :now', { now })
      .groupBy('alert.service_id')
      .orderBy('alert.service_id', 'ASC')
      .getRawMany<{ serviceId: string }>();
    return rows.map((row) => row.serviceId);
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

  // The (tenant, alert, window, channel) unique key picks the row; incrementing in SQL keeps the
  // count right when two deliveries of the same event overlap.
  async recordAttemptOutcome(
    tenantId: string,
    alertId: string,
    matchingWindow: AvailabilityAlertMatchingWindow,
    outcome: Exclude<AvailabilityAlertAttemptOutcome, 'PENDING'>,
    errorMessage: string | null,
  ): Promise<boolean> {
    const manager = getActiveEntityManager() ?? this.repo.manager;
    const [, affected] = (await manager.query(
      `UPDATE "booking"."availability_alert_notification_attempts"
          SET "outcome" = $1, "attempt_count" = "attempt_count" + 1, "last_error" = $2
        WHERE "tenant_id" = $3 AND "alert_id" = $4 AND "channel" = 'EMAIL'
          AND "matching_window" = tstzrange($5::timestamptz, $6::timestamptz, '[)')`,
      [outcome, errorMessage, tenantId, alertId, matchingWindow.startsAt, matchingWindow.endsAt],
    )) as [unknown, number];
    return affected === 1;
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

    await this.persistPendingAttempt(manager, alert);
    await drainDomainEvents(alert, this.outboxPublisher);
    alert.markPersisted(nextVersion);
  }

  // M23-S07: the attempt recorded by recordNotificationAttempt() goes in the same transaction as
  // the NOTIFIED status change. ON CONFLICT DO NOTHING on the (tenant, alert, window, channel)
  // unique key makes a replay of the same match a no-op rather than a failure.
  private async persistPendingAttempt(manager: EntityManager, alert: AvailabilityAlert) {
    const attempt = alert.takePendingAttempt();
    if (!attempt) return;
    await manager.query(
      `INSERT INTO "booking"."availability_alert_notification_attempts"
         ("id", "tenant_id", "alert_id", "matching_window", "channel", "attempted_at", "outcome")
       VALUES ($1, $2, $3, tstzrange($4::timestamptz, $5::timestamptz, '[)'), $6, $7, $8)
       ON CONFLICT ("tenant_id", "alert_id", "matching_window", "channel") DO NOTHING`,
      [
        attempt.id,
        attempt.tenantId,
        attempt.alertId,
        attempt.matchingWindow.startsAt,
        attempt.matchingWindow.endsAt,
        attempt.channel,
        attempt.attemptedAt,
        attempt.outcome,
      ],
    );
  }
}
