import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
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
  IBookingRepository,
} from '../../application/ports/booking-repository.port';
import {
  BookingConcurrentModificationError,
  BookingNotFoundError,
} from '../../domain/errors/booking-domain.error';
import { Booking } from '../../domain/booking.aggregate';
import { BookingEntity } from '../entities/booking.entity';
import { BookingLineEntity } from '../entities/booking-line.entity';
import { toDomain, toEntity, toLineEntity, toUpdateSet } from './typeorm-booking.mapper';
import { rethrowSaveError } from './typeorm-booking.persistence-errors';

@Injectable()
export class TypeOrmBookingRepository implements IBookingRepository {
  private static readonly PERSISTED_LINE_FIELDS: (keyof BookingLineEntity)[] = [
    'serviceId',
    'serviceNameAtBooking',
    'priceAtBookingAmount',
    'durationMinsAtBooking',
    'pointsValueAtBooking',
    'requiresPickupAddressAtBooking',
    'actualPriceChargedAmount',
  ];

  constructor(
    @InjectRepository(BookingEntity)
    private readonly repo: Repository<BookingEntity>,
    @InjectRepository(BookingLineEntity)
    private readonly lineRepo: Repository<BookingLineEntity>,
    @Inject(TENANT_SETTINGS_PORT) private readonly settingsPort: ITenantSettingsPort,
    @Inject(OUTBOX_PUBLISHER) private readonly outboxPublisher: IOutboxPublisher,
  ) {}

  async findById(id: string, tenantId: string): Promise<Booking | null> {
    const entity = await this.repo.findOne({ where: { id, tenantId } });
    if (!entity) return null;
    const lineEntities = await this.lineRepo.find({ where: { bookingId: id, tenantId } });
    const { currency } = (await this.settingsPort.getSettings(tenantId)).localization;
    return toDomain(entity, lineEntities, currency);
  }

  async findAllByTenant(tenantId: string, filters: BookingFilters = {}): Promise<Booking[]> {
    const where = this.buildWhere(tenantId, filters);
    const entities = await this.repo.find({ where, order: { scheduledAt: 'ASC' } });
    if (!entities.length) return [];

    const linesByBookingId = await this.findLinesByBookingId(entities, tenantId);
    const { currency } = (await this.settingsPort.getSettings(tenantId)).localization;
    return entities.map((e) => toDomain(e, linesByBookingId.get(e.id) ?? [], currency));
  }

  async findAllByTenantPaginated(
    tenantId: string,
    filters: BookingListFilters,
  ): Promise<BookingPaginatedResult> {
    const where = this.buildWhere(tenantId, filters);
    const [entities, total] = await this.repo.findAndCount({
      where,
      order: { scheduledAt: 'ASC' },
      take: filters.limit,
      skip: filters.offset,
    });
    if (!entities.length) return { items: [], total };

    const linesByBookingId = await this.findLinesByBookingId(entities, tenantId);
    const { currency } = (await this.settingsPort.getSettings(tenantId)).localization;
    return {
      items: entities.map((e) => toDomain(e, linesByBookingId.get(e.id) ?? [], currency)),
      total,
    };
  }

  private buildWhere(tenantId: string, filters: BookingFilters): FindOptionsWhere<BookingEntity> {
    const where: FindOptionsWhere<BookingEntity> = { tenantId };
    if (filters.status?.length === 1) where.status = filters.status[0];
    else if (filters.status?.length) where.status = In(filters.status);
    if (filters.customerId) where.customerId = filters.customerId;
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

    const linesByBookingId = new Map<string, BookingLineEntity[]>();
    for (const line of allLines) {
      const list = linesByBookingId.get(line.bookingId) ?? [];
      list.push(line);
      linesByBookingId.set(line.bookingId, list);
    }
    return linesByBookingId;
  }

  async save(booking: Booking): Promise<void> {
    const bookingEntity = toEntity(booking);

    const manager = getActiveEntityManager();
    try {
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
    } catch (err) {
      rethrowSaveError(err);
    }
  }

  private async persistBooking(
    manager: EntityManager,
    booking: Booking,
    bookingEntity: BookingEntity,
  ): Promise<void> {
    const nextVersion = booking.version === undefined ? 1 : booking.version + 1;

    if (booking.version === undefined) {
      await manager.insert(BookingEntity, bookingEntity);
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
      await this.syncBookingLines(manager, booking);
    }

    await drainDomainEvents(booking, this.outboxPublisher);
    booking.markPersisted(nextVersion);
  }

  private async syncBookingLines(manager: EntityManager, booking: Booking): Promise<void> {
    const currentLineEntities = await manager.find(BookingLineEntity, {
      where: { bookingId: booking.id, tenantId: booking.tenantId },
    });
    const currentByLineId = new Map(currentLineEntities.map((line) => [line.lineId, line]));

    const nextLineEntities = booking.lines.map((line) =>
      toLineEntity(line, booking.id, booking.tenantId),
    );
    const nextLineIds = new Set(nextLineEntities.map((line) => line.lineId));

    const lineIdsToDelete = currentLineEntities
      .filter((line) => !nextLineIds.has(line.lineId))
      .map((line) => line.lineId);
    const lineEntitiesToSave = nextLineEntities.filter((line) => {
      const current = currentByLineId.get(line.lineId);
      return !current || !this.sameLinePersistenceState(current, line);
    });

    if (lineIdsToDelete.length) {
      await manager.delete(BookingLineEntity, {
        bookingId: booking.id,
        tenantId: booking.tenantId,
        lineId: In(lineIdsToDelete),
      });
    }

    if (lineEntitiesToSave.length) {
      await manager.save(BookingLineEntity, lineEntitiesToSave);
    }
  }

  private sameLinePersistenceState(current: BookingLineEntity, next: BookingLineEntity): boolean {
    return TypeOrmBookingRepository.PERSISTED_LINE_FIELDS.every(
      (field) => current[field] === next[field],
    );
  }
}
