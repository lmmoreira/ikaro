import { EntityManager, In } from 'typeorm';
import { Booking } from '../../domain/booking.aggregate';
import { BookingLineEntity } from '../entities/booking-line.entity';
import { toLineEntity } from './typeorm-booking.mapper';

// Split out of typeorm-booking.repository.ts to keep it under the file-length cap — pure
// manager-scoped line-sync logic, no `this` dependency, so a plain exported function (mirroring
// typeorm-booking-resource-assignments.helpers.ts's own split-file precedent).

const PERSISTED_LINE_FIELDS: (keyof BookingLineEntity)[] = [
  'serviceId',
  'serviceNameAtBooking',
  'priceAtBookingAmount',
  'durationMinsAtBooking',
  'pointsValueAtBooking',
  'requiresPickupAddressAtBooking',
  'actualPriceChargedAmount',
];

function sameLinePersistenceState(current: BookingLineEntity, next: BookingLineEntity): boolean {
  return PERSISTED_LINE_FIELDS.every((field) => current[field] === next[field]);
}

export async function syncBookingLines(manager: EntityManager, booking: Booking): Promise<void> {
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
    return !current || !sameLinePersistenceState(current, line);
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
