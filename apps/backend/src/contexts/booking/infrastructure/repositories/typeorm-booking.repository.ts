import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  EntityManager,
  FindOptionsWhere,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { drainDomainEvents } from '../../../../shared/infrastructure/outbox/drain-domain-events';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import {
  getActiveEntityManager,
  runInNewTransaction,
} from '../../../../shared/infrastructure/transaction-context';
import { IOutboxPublisher, OUTBOX_PUBLISHER } from '../../../../shared/ports/outbox-publisher.port';
import {
  ITenantSettingsPort,
  TENANT_SETTINGS_PORT,
} from '../../../../shared/ports/tenant-settings.port';
import { Address } from '../../../../shared/value-objects/address';
import { Email } from '../../../../shared/value-objects/email.vo';
import { Money } from '../../../../shared/value-objects/money';
import { PhoneNumber } from '../../../../shared/value-objects/phone-number.vo';
import {
  BookingFilters,
  BookingListFilters,
  BookingPaginatedResult,
  IBookingRepository,
} from '../../application/ports/booking-repository.port';
import {
  BookingConcurrentModificationError,
  BookingNotFoundError,
  BookingSlotUnavailableError,
} from '../../domain/errors/booking-domain.error';
import { Booking, BookingProps, BookingStatus, BookingType } from '../../domain/booking.aggregate';
import { BookingLine } from '../../domain/booking-line.entity';
import { BookingEntity } from '../entities/booking.entity';
import { BookingLineEntity } from '../entities/booking-line.entity';

@Injectable()
export class TypeOrmBookingRepository implements IBookingRepository {
  private static readonly APPROVED_SLOT_EXCLUSION = 'EX_booking_bookings_approved_slot';
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
    return this.toDomain(entity, lineEntities, currency);
  }

  async findAllByTenant(tenantId: string, filters: BookingFilters = {}): Promise<Booking[]> {
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

    const entities = await this.repo.find({ where, order: { scheduledAt: 'ASC' } });
    if (!entities.length) return [];

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

    const { currency } = (await this.settingsPort.getSettings(tenantId)).localization;
    return entities.map((e) => this.toDomain(e, linesByBookingId.get(e.id) ?? [], currency));
  }

  async findAllByTenantPaginated(
    tenantId: string,
    filters: BookingListFilters,
  ): Promise<BookingPaginatedResult> {
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

    const [entities, total] = await this.repo.findAndCount({
      where,
      order: { scheduledAt: 'ASC' },
      take: filters.limit,
      skip: filters.offset,
    });

    if (!entities.length) return { items: [], total };

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

    const { currency } = (await this.settingsPort.getSettings(tenantId)).localization;
    return {
      items: entities.map((e) => this.toDomain(e, linesByBookingId.get(e.id) ?? [], currency)),
      total,
    };
  }

  async save(booking: Booking): Promise<void> {
    const bookingEntity = this.toEntity(booking);

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
      const driverError =
        err instanceof QueryFailedError
          ? (err as QueryFailedError & {
              code?: string;
              constraint?: string;
              driverError?: { code?: string; constraint?: string };
            })
          : null;
      const code = driverError?.driverError?.code ?? driverError?.code;
      const constraint = driverError?.driverError?.constraint ?? driverError?.constraint;
      if (
        err instanceof QueryFailedError &&
        code === '23P01' &&
        constraint === TypeOrmBookingRepository.APPROVED_SLOT_EXCLUSION
      ) {
        throw new BookingSlotUnavailableError();
      }
      throw err;
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
        .set(this.toUpdateSet(bookingEntity))
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
      this.toLineEntity(line, booking.id, booking.tenantId),
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

  private toDomain(
    entity: BookingEntity,
    lineEntities: BookingLineEntity[],
    currency: string,
  ): Booking {
    const lines = lineEntities.map((l) =>
      BookingLine.reconstitute({
        lineId: l.lineId,
        bookingId: l.bookingId,
        tenantId: l.tenantId,
        serviceId: l.serviceId,
        serviceNameAtBooking: l.serviceNameAtBooking,
        priceAtBooking: Money.from(l.priceAtBookingAmount, currency),
        durationMinsAtBooking: l.durationMinsAtBooking,
        pointsValueAtBooking: l.pointsValueAtBooking,
        requiresPickupAddressAtBooking: l.requiresPickupAddressAtBooking,
        actualPriceCharged: l.actualPriceChargedAmount
          ? Money.from(l.actualPriceChargedAmount, currency)
          : null,
      }),
    );

    const props: BookingProps = {
      id: entity.id,
      tenantId: entity.tenantId,
      status: entity.status as BookingStatus,
      type: entity.type as BookingType,
      customerId: entity.customerId,
      contactEmail: Email.create(entity.contactEmail),
      contactName: entity.contactName,
      contactPhone: PhoneNumber.create(entity.contactPhone),
      contactAddress: entity.contactAddress ? Address.reconstitute(entity.contactAddress) : null,
      pickupAddress: entity.pickupAddress ? Address.reconstitute(entity.pickupAddress) : null,
      notes: entity.notes,
      scheduledAt: entity.scheduledAt,
      totalDurationMins: entity.totalDurationMins,
      totalPrice: Money.from(entity.totalPriceAmount, currency),
      totalActualPrice: entity.totalActualPriceAmount
        ? Money.from(entity.totalActualPriceAmount, currency)
        : null,
      discountPointsUsed: entity.discountPointsUsed,
      discountAmount: entity.discountAmount ? Money.from(entity.discountAmount, currency) : null,
      lines,
      beforeServicePhotoUrls: entity.beforeServicePhotoUrls,
      afterServicePhotoUrls: entity.afterServicePhotoUrls,
      adminNotes: entity.adminNotes,
      infoRequestMessage: entity.infoRequestMessage,
      infoRequestedAt: entity.infoRequestedAt,
      infoRequestedBy: entity.infoRequestedBy,
      infoResponseMessage: entity.infoResponseMessage,
      infoSubmittedAt: entity.infoSubmittedAt,
      approvedAt: entity.approvedAt,
      approvedBy: entity.approvedBy,
      completedAt: entity.completedAt,
      completedBy: entity.completedBy,
      cancelledAt: entity.cancelledAt,
      cancelledBy: entity.cancelledBy,
      cancellationReason: entity.cancellationReason,
      rejectedAt: entity.rejectedAt,
      rejectedBy: entity.rejectedBy,
      rejectionReason: entity.rejectionReason,
      createdAt: entity.createdAt,
      version: entity.version,
    };

    return Booking.reconstitute(props);
  }

  private toEntity(booking: Booking): BookingEntity {
    const entity = new BookingEntity();
    entity.id = booking.id;
    entity.tenantId = booking.tenantId;
    entity.status = booking.status;
    entity.type = booking.type;
    entity.customerId = booking.customerId;
    entity.contactEmail = booking.contactEmail.address;
    entity.contactName = booking.contactName;
    entity.contactPhone = booking.contactPhone.value;
    entity.contactAddress = booking.contactAddress?.toJSON() ?? null;
    entity.pickupAddress = booking.pickupAddress?.toJSON() ?? null;
    entity.notes = booking.notes;
    entity.scheduledAt = booking.scheduledAt;
    entity.scheduledEndAt = new Date(
      booking.scheduledAt.getTime() + booking.totalDurationMins * 60_000,
    );
    entity.totalDurationMins = booking.totalDurationMins;
    entity.totalPriceAmount = booking.totalPrice.amount.toFixed(2);
    entity.totalActualPriceAmount = booking.totalActualPrice?.amount.toFixed(2) ?? null;
    entity.discountPointsUsed = booking.discountPointsUsed;
    entity.discountAmount = booking.discountAmount?.amount.toFixed(2) ?? null;
    entity.beforeServicePhotoUrls = booking.beforeServicePhotoUrls;
    entity.afterServicePhotoUrls = booking.afterServicePhotoUrls;
    entity.adminNotes = booking.adminNotes;
    entity.infoRequestMessage = booking.infoRequestMessage;
    entity.infoRequestedAt = booking.infoRequestedAt;
    entity.infoRequestedBy = booking.infoRequestedBy;
    entity.infoResponseMessage = booking.infoResponseMessage;
    entity.infoSubmittedAt = booking.infoSubmittedAt;
    entity.approvedAt = booking.approvedAt;
    entity.approvedBy = booking.approvedBy;
    entity.completedAt = booking.completedAt;
    entity.completedBy = booking.completedBy;
    entity.cancelledAt = booking.cancelledAt;
    entity.cancelledBy = booking.cancelledBy;
    entity.cancellationReason = booking.cancellationReason;
    entity.rejectedAt = booking.rejectedAt;
    entity.rejectedBy = booking.rejectedBy;
    entity.rejectionReason = booking.rejectionReason;
    entity.createdAt = booking.createdAt;
    entity.updatedAt = new Date();
    if (booking.version !== undefined) entity.version = booking.version;
    return entity;
  }

  private toLineEntity(line: BookingLine, bookingId: string, tenantId: string): BookingLineEntity {
    const entity = new BookingLineEntity();
    entity.lineId = line.lineId;
    entity.bookingId = bookingId;
    entity.tenantId = tenantId;
    entity.serviceId = line.serviceId;
    entity.serviceNameAtBooking = line.serviceNameAtBooking;
    entity.priceAtBookingAmount = line.priceAtBooking.amount.toFixed(2);
    entity.durationMinsAtBooking = line.durationMinsAtBooking;
    entity.pointsValueAtBooking = line.pointsValueAtBooking;
    entity.requiresPickupAddressAtBooking = line.requiresPickupAddressAtBooking;
    entity.actualPriceChargedAmount = line.actualPriceCharged?.amount.toFixed(2) ?? null;
    return entity;
  }

  private sameLinePersistenceState(current: BookingLineEntity, next: BookingLineEntity): boolean {
    return TypeOrmBookingRepository.PERSISTED_LINE_FIELDS.every(
      (field) => current[field] === next[field],
    );
  }

  private toUpdateSet(bookingEntity: BookingEntity): QueryDeepPartialEntity<BookingEntity> {
    const updatable = Object.fromEntries(
      Object.entries(bookingEntity).filter(
        ([key]) => !['id', 'tenantId', 'createdAt', 'version'].includes(key),
      ),
    ) as QueryDeepPartialEntity<BookingEntity>;
    return { ...updatable, version: () => '"version" + 1' };
  }
}
