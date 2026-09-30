import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import {
  Between,
  EntityManager,
  FindOptionsWhere,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { drainDomainEvents } from '../../../../shared/infrastructure/outbox/drain-domain-events';
import { runInNewTransaction } from '../../../../shared/infrastructure/run-in-new-transaction';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { IOutboxPublisher, OUTBOX_PUBLISHER } from '../../../../shared/ports/outbox-publisher.port';
import {
  ITenantSettingsPort,
  TENANT_SETTINGS_PORT,
} from '../../../../shared/ports/tenant-settings.port';
import {
  BookingFilters,
  BookingListFilters,
  BookingPaginatedResult,
  BookingResourceAssignmentSummary,
  IBookingRepository,
} from '../../application/ports/booking-repository.port';
import {
  BookingConcurrentModificationError,
  BookingNotFoundError,
} from '../../domain/errors/booking-domain.error';
import { Booking, BookingStatus } from '../../domain/booking.aggregate';
import { BookingAttendeeEntity } from '../entities/booking-attendee.entity';
import { BookingEntity } from '../entities/booking.entity';
import { BookingLineEntity } from '../entities/booking-line.entity';
import { BookingLineResourceAssignmentEntity } from '../entities/booking-line-resource-assignment.entity';
import { toAttendeeEntity, toDomain, toEntity, toUpdateSet } from './typeorm-booking.mapper';
import {
  groupByBookingId,
  groupResourceAssignmentsByBookingId,
  ResourceAssignmentRow,
} from './typeorm-booking-resource-assignments.helpers';
import { syncBookingLines } from './typeorm-booking-line-sync.helpers';

const EMPTY_RESOURCE_ASSIGNMENTS: ReadonlyMap<string, readonly BookingResourceAssignmentSummary[]> =
  new Map();

@Injectable()
export class TypeOrmBookingRepository implements IBookingRepository {
  constructor(
    @InjectRepository(BookingEntity)
    private readonly repo: Repository<BookingEntity>,
    @InjectRepository(BookingLineEntity)
    private readonly lineRepo: Repository<BookingLineEntity>,
    @InjectRepository(BookingAttendeeEntity)
    private readonly attendeeRepo: Repository<BookingAttendeeEntity>,
    @InjectRepository(BookingLineResourceAssignmentEntity)
    private readonly resourceAssignmentRepo: Repository<BookingLineResourceAssignmentEntity>,
    @Inject(TENANT_SETTINGS_PORT) private readonly settingsPort: ITenantSettingsPort,
    @Inject(OUTBOX_PUBLISHER) private readonly outboxPublisher: IOutboxPublisher,
  ) {}

  async findById(id: string, tenantId: string): Promise<Booking | null> {
    const entity = await this.repo.findOne({ where: { id, tenantId } });
    return entity ? this.hydrateOne(entity, tenantId) : null;
  }

  async findByIds(ids: string[], tenantId: string): Promise<Booking[]> {
    if (!ids.length) return [];
    const entities = await this.repo.find({ where: { tenantId, id: In(ids) } });
    return entities.length ? this.hydrateMany(entities, tenantId) : [];
  }

  async findFutureActiveByRecurringSchedule(
    tenantId: string,
    recurringScheduleId: string,
    after: Date,
  ): Promise<Booking[]> {
    const entities = await this.repo.find({
      where: {
        tenantId,
        recurringScheduleId,
        scheduledAt: MoreThanOrEqual(after),
        status: In([BookingStatus.PENDING, BookingStatus.INFO_REQUESTED, BookingStatus.APPROVED]),
      },
    });
    return entities.length ? this.hydrateMany(entities, tenantId) : [];
  }

  private async hydrateOne(entity: BookingEntity, tenantId: string): Promise<Booking> {
    const lineEntities = await this.lineRepo.find({ where: { bookingId: entity.id, tenantId } });
    const attendeeEntities = await this.attendeeRepo.find({
      where: { bookingId: entity.id, tenantId },
    });
    const { currency } = (await this.settingsPort.getSettings(tenantId)).localization;
    return toDomain(entity, lineEntities, attendeeEntities, currency);
  }

  // Shared by findAllByTenant/findFutureActiveByRecurringSchedule/findAllByTenantPaginated — all
  // three batch-load lines/attendees/currency for a page of bookings, only the source query and
  // (for the paginated variant) resourceAssignments differ.
  private async hydrateMany(entities: BookingEntity[], tenantId: string): Promise<Booking[]> {
    const linesByBookingId = await this.findLinesByBookingId(entities, tenantId);
    const attendeesByBookingId = await this.findAttendeesByBookingId(entities, tenantId);
    const { currency } = (await this.settingsPort.getSettings(tenantId)).localization;
    return entities.map((e) =>
      toDomain(e, linesByBookingId.get(e.id) ?? [], attendeesByBookingId.get(e.id) ?? [], currency),
    );
  }

  async findAllByTenant(tenantId: string, filters: BookingFilters = {}): Promise<Booking[]> {
    const where = this.buildWhere(tenantId, filters);
    const entities = await this.repo.find({ where, order: { scheduledAt: 'ASC' } });
    return entities.length ? this.hydrateMany(entities, tenantId) : [];
  }

  async findAllByTenantPaginated(
    tenantId: string,
    filters: BookingListFilters,
  ): Promise<BookingPaginatedResult> {
    const where = this.buildWhere(tenantId, filters);
    // `id` is a tie-breaker, not just `scheduledAt`: Postgres has no defined order among rows with
    // equal ORDER BY keys, so two bookings sharing a scheduledAt could otherwise land on either
    // side of a page boundary non-deterministically between two sequential offset-paginated
    // requests, silently skipping a row that a stable sort would have kept in view.
    const [entities, total] = await this.repo.findAndCount({
      where,
      order: { scheduledAt: 'ASC', id: 'ASC' },
      take: filters.limit,
      skip: filters.offset,
    });
    if (!entities.length) {
      return { items: [], total, resourceAssignmentsByBookingId: EMPTY_RESOURCE_ASSIGNMENTS };
    }

    const items = await this.hydrateMany(entities, tenantId);
    const resourceAssignmentsByBookingId = await this.findResourceAssignmentsByBookingId(
      entities,
      tenantId,
    );
    return { items, total, resourceAssignmentsByBookingId };
  }

  async existsByServiceId(serviceId: string, tenantId: string): Promise<boolean> {
    // TypeORM's count() always discards take/limit/skip before running the COUNT query (see
    // SelectQueryBuilder.executeCountQuery()) — it would scan/count every matching row instead of
    // stopping at the first one. existsBy() runs a real EXISTS(...) LIMIT 1 query.
    return this.lineRepo.existsBy({ serviceId, tenantId });
  }

  private buildWhere(tenantId: string, filters: BookingFilters): FindOptionsWhere<BookingEntity> {
    const where: FindOptionsWhere<BookingEntity> = { tenantId };
    if (filters.status?.length === 1) where.status = filters.status[0];
    else if (filters.status?.length) where.status = In(filters.status);
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.recurringScheduleId) where.recurringScheduleId = filters.recurringScheduleId;
    if (filters.scheduledAfter && filters.scheduledBefore) {
      where.scheduledAt = Between(filters.scheduledAfter, filters.scheduledBefore);
    } else if (filters.scheduledAfter) {
      where.scheduledAt = MoreThanOrEqual(filters.scheduledAfter);
    } else if (filters.scheduledBefore) {
      where.scheduledAt = LessThanOrEqual(filters.scheduledBefore);
    }
    return where;
  }

  private async findLinesByBookingId(
    entities: BookingEntity[],
    tenantId: string,
  ): Promise<Map<string, BookingLineEntity[]>> {
    const bookingIds = entities.map((e) => e.id);
    const allLines = await this.lineRepo.find({
      where: bookingIds.map((bookingId) => ({ bookingId, tenantId })),
    });
    return groupByBookingId(allLines);
  }

  private async findAttendeesByBookingId(
    entities: BookingEntity[],
    tenantId: string,
  ): Promise<Map<string, BookingAttendeeEntity[]>> {
    const bookingIds = entities.map((e) => e.id);
    const allAttendees = await this.attendeeRepo.find({
      where: bookingIds.map((bookingId) => ({ bookingId, tenantId })),
    });
    return groupByBookingId(allAttendees);
  }

  // One batched query for the whole page (mirrors findLinesByBookingId's own shape) — never one
  // query per booking, which would be a real N+1 risk on a list endpoint. booking_line_resource_
  // assignments has no bookingId column of its own; join through booking_lines (per-tenant on
  // every hop, not just the outer WHERE — see the same discipline in
  // typeorm-booking-availability.adapter.ts's findDayGridOccupancy). Deduplicated by resourceId
  // per booking — a resource assigned across 2+ lines/legs of the same booking is listed once.
  private async findResourceAssignmentsByBookingId(
    entities: BookingEntity[],
    tenantId: string,
  ): Promise<Map<string, BookingResourceAssignmentSummary[]>> {
    const bookingIds = entities.map((e) => e.id);
    const rows = await this.resourceAssignmentRepo
      .createQueryBuilder('blra')
      .innerJoin(
        BookingLineEntity,
        'bl',
        'bl.lineId = blra.bookingLineId AND bl.tenantId = blra.tenantId',
      )
      .select([
        'bl.bookingId AS "bookingId"',
        'blra.resourceId AS "resourceId"',
        'blra.resourceType AS "resourceType"',
        'blra.resourceNameAtAssignment AS "resourceName"',
      ])
      .where('blra.tenantId = :tenantId', { tenantId })
      .andWhere('bl.bookingId IN (:...bookingIds)', { bookingIds })
      .getRawMany<ResourceAssignmentRow>();

    return groupResourceAssignmentsByBookingId(rows);
  }

  async save(booking: Booking): Promise<void> {
    const bookingEntity = toEntity(booking);

    const manager = getActiveEntityManager();
    if (manager) {
      await this.persistBooking(manager, booking, bookingEntity);
    } else {
      // Self-managed transaction (no ambient txManager.run() from the caller): runInNewTransaction
      // is the same sequence TypeOrmTransactionManager.run() uses — the ambient context must
      // point at this tx too, or drainDomainEvents' outbox write (inside persistBooking) would
      // have no active manager to join and would run outside this transaction entirely, breaking
      // the same-transaction guarantee this branch exists to provide (TD24-S03: TypeOrmOutboxRepository
      // no longer has a disconnected standalone fallback).
      await runInNewTransaction(this.repo.manager, (tx) =>
        this.persistBooking(tx, booking, bookingEntity),
      );
    }
  }

  private async persistBooking(
    manager: EntityManager,
    booking: Booking,
    bookingEntity: BookingEntity,
  ): Promise<void> {
    const nextVersion = booking.version === undefined ? 1 : booking.version + 1;

    if (booking.version === undefined) {
      // Cast matches toUpdateSet()'s own precedent below (and
      // typeorm-hotsite-config.repository.ts/typeorm-lead-form-config.repository.ts) — TypeORM's
      // QueryDeepPartialEntity mapped type doesn't resolve cleanly against a JSONB column typed
      // as Record<string, unknown> (intakeAnswers, M22-S02), even though the runtime value is a
      // plain BookingEntity.
      await manager.insert(BookingEntity, bookingEntity as QueryDeepPartialEntity<BookingEntity>);
      await this.insertAttendeesIfAny(manager, booking);
    } else {
      const currentVersion = booking.version;
      const result = await manager
        .createQueryBuilder()
        .update(BookingEntity)
        .set(toUpdateSet(bookingEntity))
        .where('id = :id', { id: booking.id })
        .andWhere('tenant_id = :tenantId', { tenantId: booking.tenantId })
        .andWhere('version = :version', { version: currentVersion })
        .execute();

      if (result.affected !== 1) {
        const current = await manager.findOne(BookingEntity, {
          where: { id: booking.id, tenantId: booking.tenantId },
          select: { version: true },
        });
        if (!current) {
          throw new BookingNotFoundError(booking.id);
        }
        throw new BookingConcurrentModificationError();
      }
    }

    if (booking.linesModified) {
      await syncBookingLines(manager, booking);
    }

    await drainDomainEvents(booking, this.outboxPublisher);
    booking.markPersisted(nextVersion);
  }

  // Attendees are immutable once a booking exists (UC-068 — no edit flow), unlike lines (synced
  // above on every save) — insert-once, on the initial INSERT branch only, never re-synced.
  private async insertAttendeesIfAny(manager: EntityManager, booking: Booking): Promise<void> {
    if (!booking.attendees.length) return;
    const attendeeEntities = booking.attendees.map((a) =>
      toAttendeeEntity(a, booking.id, booking.tenantId),
    );
    await manager.insert(BookingAttendeeEntity, attendeeEntities);
  }
}
