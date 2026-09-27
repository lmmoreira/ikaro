import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { drainDomainEvents } from '../../../../shared/infrastructure/outbox/drain-domain-events';
import { runInNewTransaction } from '../../../../shared/infrastructure/run-in-new-transaction';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { IOutboxPublisher, OUTBOX_PUBLISHER } from '../../../../shared/ports/outbox-publisher.port';
import {
  IRecurringBookingScheduleRepository,
  RecurringBookingScheduleListFilters,
} from '../../application/ports/recurring-booking-schedule-repository.port';
import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import { RecurringBookingScheduleEntity } from '../entities/recurring-booking-schedule.entity';
import { RecurringBookingScheduleExceptionEntity } from '../entities/recurring-booking-schedule-exception.entity';
import { RecurringBookingScheduleResourceAssignmentEntity } from '../entities/recurring-booking-schedule-resource-assignment.entity';
import {
  toDomain,
  toEntity,
  toExceptionEntities,
  toResourceAssignmentEntities,
} from './typeorm-recurring-booking-schedule.mapper';

@Injectable()
export class TypeOrmRecurringBookingScheduleRepository implements IRecurringBookingScheduleRepository {
  constructor(
    @InjectRepository(RecurringBookingScheduleEntity)
    private readonly repo: Repository<RecurringBookingScheduleEntity>,
    @InjectRepository(RecurringBookingScheduleResourceAssignmentEntity)
    private readonly assignmentRepo: Repository<RecurringBookingScheduleResourceAssignmentEntity>,
    @InjectRepository(RecurringBookingScheduleExceptionEntity)
    private readonly exceptionRepo: Repository<RecurringBookingScheduleExceptionEntity>,
    @Inject(OUTBOX_PUBLISHER) private readonly outboxPublisher: IOutboxPublisher,
  ) {}

  async findById(id: string, tenantId: string): Promise<RecurringBookingSchedule | null> {
    const entity = await this.repo.findOne({ where: { id, tenantId } });
    if (!entity) return null;
    const [assignments, exceptions] = await Promise.all([
      this.assignmentRepo.find({ where: { recurringScheduleId: id, tenantId } }),
      this.exceptionRepo.find({ where: { recurringScheduleId: id, tenantId } }),
    ]);
    return toDomain(entity, assignments, exceptions);
  }

  async findAllByTenant(
    tenantId: string,
    filters: RecurringBookingScheduleListFilters,
  ): Promise<RecurringBookingSchedule[]> {
    const entities = await this.repo.find({
      where: { tenantId, ...(filters.customerId ? { customerId: filters.customerId } : {}) },
      order: { createdAt: 'DESC' },
    });
    if (!entities.length) return [];

    const ids = entities.map((e) => e.id);
    const [assignments, exceptions] = await Promise.all([
      this.assignmentRepo.find({
        where: ids.map((recurringScheduleId) => ({ tenantId, recurringScheduleId })),
      }),
      this.exceptionRepo.find({
        where: ids.map((recurringScheduleId) => ({ tenantId, recurringScheduleId })),
      }),
    ]);
    const assignmentsByScheduleId = groupBy(assignments, (a) => a.recurringScheduleId);
    const exceptionsByScheduleId = groupBy(exceptions, (e) => e.recurringScheduleId);

    return entities.map((e) =>
      toDomain(e, assignmentsByScheduleId.get(e.id) ?? [], exceptionsByScheduleId.get(e.id) ?? []),
    );
  }

  async countActiveByResource(tenantId: string, resourceId: string): Promise<number> {
    return this.assignmentRepo
      .createQueryBuilder('a')
      .innerJoin(
        RecurringBookingScheduleEntity,
        's',
        's.id = a.recurringScheduleId AND s.tenantId = a.tenantId',
      )
      .where('a.tenantId = :tenantId', { tenantId })
      .andWhere('a.resourceId = :resourceId', { resourceId })
      .andWhere('s.status = :status', { status: 'ACTIVE' })
      .andWhere('s.assignmentPolicy = :policy', { policy: 'FIXED_ASSIGNMENT' })
      .getCount();
  }

  async countActiveResolvePerOccurrenceByService(
    tenantId: string,
    serviceId: string,
  ): Promise<number> {
    return this.repo.count({
      where: {
        tenantId,
        serviceId,
        status: 'ACTIVE',
        assignmentPolicy: 'RESOLVE_PER_OCCURRENCE',
      },
    });
  }

  async save(schedule: RecurringBookingSchedule): Promise<void> {
    const manager = getActiveEntityManager();
    if (manager) {
      await this.persist(schedule);
    } else {
      await runInNewTransaction(this.repo.manager, () => this.persist(schedule));
    }
  }

  private async persist(schedule: RecurringBookingSchedule): Promise<void> {
    const entity = toEntity(schedule);
    const existing = await this.repo.findOne({
      where: { id: schedule.id, tenantId: schedule.tenantId },
      select: { id: true },
    });

    if (!existing) {
      await this.repo.insert(entity);
      const assignmentEntities = toResourceAssignmentEntities(schedule);
      if (assignmentEntities.length) await this.assignmentRepo.insert(assignmentEntities);
    } else {
      await this.repo.update({ id: schedule.id, tenantId: schedule.tenantId }, entity);
    }

    const pendingExceptions = schedule.pendingNewExceptions;
    if (pendingExceptions.length) {
      await this.exceptionRepo.insert(toExceptionEntities(schedule, pendingExceptions));
    }

    await drainDomainEvents(schedule, this.outboxPublisher);
  }
}

function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}
