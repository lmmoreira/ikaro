import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, LessThan, LessThanOrEqual, Repository } from 'typeorm';
import { BookingConcurrentModificationError } from '../../domain/errors/booking-domain.error';
import { drainDomainEvents } from '../../../../shared/infrastructure/outbox/drain-domain-events';
import { runInNewTransaction } from '../../../../shared/infrastructure/run-in-new-transaction';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { IOutboxPublisher, OUTBOX_PUBLISHER } from '../../../../shared/ports/outbox-publisher.port';
import {
  IRecurringBookingScheduleRepository,
  RecurringBookingScheduleListFilters,
  RecurringBookingSchedulePaginatedResult,
} from '../../application/ports/recurring-booking-schedule-repository.port';
import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import { RecurringBookingScheduleEntity } from '../entities/recurring-booking-schedule.entity';
import { RecurringBookingScheduleResourceAssignmentEntity } from '../entities/recurring-booking-schedule-resource-assignment.entity';
import {
  toDomain,
  toEntity,
  toResourceAssignmentEntities,
  toUpdateSet,
} from './typeorm-recurring-booking-schedule.mapper';

@Injectable()
export class TypeOrmRecurringBookingScheduleRepository implements IRecurringBookingScheduleRepository {
  constructor(
    @InjectRepository(RecurringBookingScheduleEntity)
    private readonly repo: Repository<RecurringBookingScheduleEntity>,
    @InjectRepository(RecurringBookingScheduleResourceAssignmentEntity)
    private readonly assignmentRepo: Repository<RecurringBookingScheduleResourceAssignmentEntity>,
    @Inject(OUTBOX_PUBLISHER) private readonly outboxPublisher: IOutboxPublisher,
  ) {}

  async findById(id: string, tenantId: string): Promise<RecurringBookingSchedule | null> {
    const entity = await this.repo.findOne({ where: { id, tenantId } });
    if (!entity) return null;
    const assignments = await this.assignmentRepo.find({
      where: { recurringScheduleId: id, tenantId },
    });
    return toDomain(entity, assignments);
  }

  // ListRecurringBookingSchedulesUseCase is this method's only caller and maps root scalar
  // fields only (list-recurring-booking-schedules.use-case.ts) — resourceAssignments are never
  // read from the returned aggregates, so hydrating them here would be an extra query and an
  // unbounded result set per schedule for nothing. findById() remains the place a caller
  // needing the full aggregate (mutation use cases) reads from.
  async findAllByTenantPaginated(
    tenantId: string,
    filters: RecurringBookingScheduleListFilters,
  ): Promise<RecurringBookingSchedulePaginatedResult> {
    // `id` is a tie-breaker, not just `createdAt`: Postgres has no defined order among rows with
    // equal ORDER BY keys, so two schedules sharing a createdAt could otherwise land on either
    // side of a page boundary non-deterministically between two sequential offset-paginated
    // requests, silently skipping or duplicating a row.
    const [entities, total] = await this.repo.findAndCount({
      where: {
        tenantId,
        ...(filters.customerId ? { customerId: filters.customerId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: filters.limit,
      skip: filters.offset,
    });
    return { items: entities.map((e) => toDomain(e, [])), total };
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

  async findPendingApprovalExpired(
    tenantId: string,
    now: Date,
  ): Promise<RecurringBookingSchedule[]> {
    const entities = await this.repo.find({
      where: { tenantId, status: 'PENDING_APPROVAL', approvalHoldExpiresAt: LessThanOrEqual(now) },
      order: { approvalHoldExpiresAt: 'ASC', id: 'ASC' },
    });
    return entities.map((e) => toDomain(e, []));
  }

  async findActiveEndedBefore(
    tenantId: string,
    localToday: string,
  ): Promise<RecurringBookingSchedule[]> {
    const entities = await this.repo.find({
      where: { tenantId, status: 'ACTIVE', endsOn: LessThan(localToday) },
      order: { endsOn: 'ASC', id: 'ASC' },
    });
    return entities.map((e) => toDomain(e, []));
  }

  async save(schedule: RecurringBookingSchedule): Promise<void> {
    const manager = getActiveEntityManager();
    if (manager) {
      await this.persist(manager, schedule);
    } else {
      // Self-managed transaction (no ambient txManager.run() from the caller): runInNewTransaction
      // is the same sequence TypeOrmTransactionManager.run() uses — the ambient context must
      // point at this tx too, or drainDomainEvents' outbox write (inside persist) would have no
      // active manager to join and would run outside this transaction entirely (mirrors
      // typeorm-booking.repository.ts's save() precedent).
      await runInNewTransaction(this.repo.manager, (tx) => this.persist(tx, schedule));
    }
  }

  private async persist(manager: EntityManager, schedule: RecurringBookingSchedule): Promise<void> {
    const scheduleRepo = manager.getRepository(RecurringBookingScheduleEntity);
    const assignmentRepo = manager.getRepository(RecurringBookingScheduleResourceAssignmentEntity);

    const entity = toEntity(schedule);
    // version === undefined means this aggregate was never loaded from (or written to) the DB —
    // a brand-new schedule. Anything else means it was read back via findById/
    // findAllByTenantPaginated/findPendingApprovalExpired/findActiveEndedBefore and must be
    // optimistically version-checked
    // on write (mirrors
    // typeorm-booking.repository.ts's own persistBooking() precedent).
    const nextVersion = schedule.version === undefined ? 1 : schedule.version + 1;

    if (schedule.version === undefined) {
      await scheduleRepo.insert(entity);
      const assignmentEntities = toResourceAssignmentEntities(schedule);
      if (assignmentEntities.length) await assignmentRepo.insert(assignmentEntities);
    } else {
      const currentVersion = schedule.version;
      const result = await scheduleRepo
        .createQueryBuilder()
        .update(RecurringBookingScheduleEntity)
        .set(toUpdateSet(entity))
        .where('id = :id', { id: schedule.id })
        .andWhere('tenant_id = :tenantId', { tenantId: schedule.tenantId })
        .andWhere('version = :version', { version: currentVersion })
        .execute();

      if (result.affected !== 1) {
        throw new BookingConcurrentModificationError();
      }

      // Wholesale-replaced child collection: only resynced when reassignResource() touched it.
      if (schedule.resourceAssignmentsModified) {
        await assignmentRepo.delete({
          tenantId: schedule.tenantId,
          recurringScheduleId: schedule.id,
        });
        const assignmentEntities = toResourceAssignmentEntities(schedule);
        if (assignmentEntities.length) await assignmentRepo.insert(assignmentEntities);
      }
    }

    await drainDomainEvents(schedule, this.outboxPublisher);
    schedule.markPersisted(nextVersion);
  }
}
