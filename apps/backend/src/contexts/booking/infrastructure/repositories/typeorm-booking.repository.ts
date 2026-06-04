import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { Address, AddressProps } from '../../../../shared/value-objects/address';
import { Email } from '../../../../shared/value-objects/email.vo';
import { Money } from '../../../../shared/value-objects/money';
import { PhoneNumber } from '../../../../shared/value-objects/phone-number.vo';
import {
  BookingFilters,
  BookingListFilters,
  BookingPaginatedResult,
  IBookingRepository,
} from '../../application/ports/booking-repository.port';
import { Booking, BookingProps, BookingStatus, BookingType } from '../../domain/booking.aggregate';
import { BookingLine } from '../../domain/booking-line.entity';
import { BookingEntity } from '../entities/booking.entity';
import { BookingLineEntity } from '../entities/booking-line.entity';

@Injectable()
export class TypeOrmBookingRepository implements IBookingRepository {
  constructor(
    @InjectRepository(BookingEntity)
    private readonly repo: Repository<BookingEntity>,
    @InjectRepository(BookingLineEntity)
    private readonly lineRepo: Repository<BookingLineEntity>,
  ) {}

  async findById(id: string, tenantId: string): Promise<Booking | null> {
    const entity = await this.repo.findOne({ where: { id, tenantId } });
    if (!entity) return null;
    const lineEntities = await this.lineRepo.find({ where: { bookingId: id, tenantId } });
    return this.toDomain(entity, lineEntities);
  }

  async findAllByTenant(tenantId: string, filters: BookingFilters = {}): Promise<Booking[]> {
    const where: FindOptionsWhere<BookingEntity> = { tenantId };
    if (filters.status) where.status = filters.status;
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.scheduledAfter && filters.scheduledBefore) {
      where.scheduledAt = Between(filters.scheduledAfter, filters.scheduledBefore);
    } else if (filters.scheduledAfter) {
      where.scheduledAt = MoreThanOrEqual(filters.scheduledAfter);
    } else if (filters.scheduledBefore) {
      where.scheduledAt = LessThanOrEqual(filters.scheduledBefore);
    }

    const entities = await this.repo.find({ where, order: { scheduledAt: 'DESC' } });
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

    return entities.map((e) => this.toDomain(e, linesByBookingId.get(e.id) ?? []));
  }

  async findAllByTenantPaginated(
    tenantId: string,
    filters: BookingListFilters,
  ): Promise<BookingPaginatedResult> {
    const where: FindOptionsWhere<BookingEntity> = { tenantId };
    if (filters.status) where.status = filters.status;
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
      order: { scheduledAt: 'DESC' },
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

    return {
      items: entities.map((e) => this.toDomain(e, linesByBookingId.get(e.id) ?? [])),
      total,
    };
  }

  async save(booking: Booking): Promise<void> {
    const bookingEntity = this.toEntity(booking);

    const manager = getActiveEntityManager();
    if (manager) {
      await manager.save(BookingEntity, bookingEntity);
      if (booking.linesModified) {
        const lineEntities = booking.lines.map((l) =>
          this.toLineEntity(l, booking.id, booking.tenantId),
        );
        await manager.delete(BookingLineEntity, {
          bookingId: booking.id,
          tenantId: booking.tenantId,
        });
        await manager.save(BookingLineEntity, lineEntities);
      }
    } else {
      await this.repo.manager.transaction(async (tx) => {
        await tx.save(BookingEntity, bookingEntity);
        if (booking.linesModified) {
          const lineEntities = booking.lines.map((l) =>
            this.toLineEntity(l, booking.id, booking.tenantId),
          );
          await tx.delete(BookingLineEntity, { bookingId: booking.id, tenantId: booking.tenantId });
          await tx.save(BookingLineEntity, lineEntities);
        }
      });
    }
  }

  private toDomain(entity: BookingEntity, lineEntities: BookingLineEntity[]): Booking {
    const lines = lineEntities.map((l) =>
      BookingLine.reconstitute({
        lineId: l.lineId,
        bookingId: l.bookingId,
        tenantId: l.tenantId,
        serviceId: l.serviceId,
        serviceNameAtBooking: l.serviceNameAtBooking,
        priceAtBooking: Money.from(l.priceAtBookingAmount, 'BRL'),
        durationMinsAtBooking: l.durationMinsAtBooking,
        pointsValueAtBooking: l.pointsValueAtBooking,
        requiresPickupAddressAtBooking: l.requiresPickupAddressAtBooking,
        actualPriceCharged: l.actualPriceChargedAmount
          ? Money.from(l.actualPriceChargedAmount, 'BRL')
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
      contactAddress: entity.contactAddress
        ? Address.reconstitute(entity.contactAddress as unknown as AddressProps)
        : null,
      pickupAddress: entity.pickupAddress
        ? Address.reconstitute(entity.pickupAddress as unknown as AddressProps)
        : null,
      scheduledAt: entity.scheduledAt,
      totalDurationMins: entity.totalDurationMins,
      totalPrice: Money.from(entity.totalPriceAmount, 'BRL'),
      totalActualPrice: entity.totalActualPriceAmount
        ? Money.from(entity.totalActualPriceAmount, 'BRL')
        : null,
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
    entity.contactAddress = (booking.contactAddress?.toJSON() ?? null) as Record<
      string,
      unknown
    > | null;
    entity.pickupAddress = (booking.pickupAddress?.toJSON() ?? null) as Record<
      string,
      unknown
    > | null;
    entity.scheduledAt = booking.scheduledAt;
    entity.totalDurationMins = booking.totalDurationMins;
    entity.totalPriceAmount = booking.totalPrice.amount.toFixed(2);
    entity.totalActualPriceAmount = booking.totalActualPrice?.amount.toFixed(2) ?? null;
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
}
