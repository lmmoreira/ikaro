import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Address } from '../../../../shared/value-objects/address';
import { Email } from '../../../../shared/value-objects/email.vo';
import { Money } from '../../../../shared/value-objects/money';
import { PhoneNumber } from '../../../../shared/value-objects/phone-number.vo';
import { Booking, BookingProps, BookingStatus, BookingType } from '../../domain/booking.aggregate';
import { BookingLine } from '../../domain/booking-line.entity';
import { BookingEntity } from '../entities/booking.entity';
import { BookingLineEntity } from '../entities/booking-line.entity';

// Split out of typeorm-booking.repository.ts to keep it under the file-length cap — pure
// domain<->entity mapping, no persistence I/O. Plain exported functions, mirroring this repo's
// `<x>.mapper.ts` convention (e.g. apps/bff/src/features/booking/bookings.mapper.ts).

export function toDomain(
  entity: BookingEntity,
  lineEntities: BookingLineEntity[],
  currency: string,
): Booking {
  const lines = lineEntities.map((l) => toDomainLine(l, currency));
  const props = toDomainProps(entity, lines, currency);
  return Booking.reconstitute(props);
}

function toDomainLine(l: BookingLineEntity, currency: string): BookingLine {
  return BookingLine.reconstitute({
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
  });
}

function toDomainProps(
  entity: BookingEntity,
  lines: BookingLine[],
  currency: string,
): BookingProps {
  return {
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
    ...toDomainLifecycleProps(entity),
  };
}

type DomainLifecycleProps = Pick<
  BookingProps,
  | 'adminNotes'
  | 'infoRequestMessage'
  | 'infoRequestedAt'
  | 'infoRequestedBy'
  | 'infoResponseMessage'
  | 'infoSubmittedAt'
  | 'approvedAt'
  | 'approvedBy'
  | 'completedAt'
  | 'completedBy'
  | 'cancelledAt'
  | 'cancelledBy'
  | 'cancellationReason'
  | 'rejectedAt'
  | 'rejectedBy'
  | 'rejectionReason'
  | 'createdAt'
  | 'version'
>;

// Lifecycle fields carried through verbatim from the entity — split out purely to keep
// toDomainProps under the function-length cap.
function toDomainLifecycleProps(entity: BookingEntity): DomainLifecycleProps {
  return {
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
}

export function toEntity(booking: Booking): BookingEntity {
  const entity = new BookingEntity();
  assignCoreFields(entity, booking);
  assignPriceFields(entity, booking);
  assignLifecycleFields(entity, booking);
  entity.updatedAt = new Date();
  if (booking.version !== undefined) entity.version = booking.version;
  return entity;
}

function assignCoreFields(entity: BookingEntity, booking: Booking): void {
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
  entity.beforeServicePhotoUrls = booking.beforeServicePhotoUrls;
  entity.afterServicePhotoUrls = booking.afterServicePhotoUrls;
}

function assignPriceFields(entity: BookingEntity, booking: Booking): void {
  entity.totalPriceAmount = booking.totalPrice.amount.toFixed(2);
  entity.totalActualPriceAmount = booking.totalActualPrice?.amount.toFixed(2) ?? null;
  entity.discountPointsUsed = booking.discountPointsUsed;
  entity.discountAmount = booking.discountAmount?.amount.toFixed(2) ?? null;
}

function assignLifecycleFields(entity: BookingEntity, booking: Booking): void {
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
}

export function toLineEntity(
  line: BookingLine,
  bookingId: string,
  tenantId: string,
): BookingLineEntity {
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

export function toUpdateSet(bookingEntity: BookingEntity): QueryDeepPartialEntity<BookingEntity> {
  const updatable = Object.fromEntries(
    Object.entries(bookingEntity).filter(
      ([key]) => !['id', 'tenantId', 'createdAt', 'version'].includes(key),
    ),
  ) as QueryDeepPartialEntity<BookingEntity>;
  return { ...updatable, version: () => '"version" + 1' };
}
