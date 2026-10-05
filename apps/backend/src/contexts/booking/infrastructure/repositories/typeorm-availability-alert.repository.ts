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
