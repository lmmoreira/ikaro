import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { EntityManager } from 'typeorm';
import { Booking } from '../../domain/booking.aggregate';
import { BookingAttendeeEntity } from '../entities/booking-attendee.entity';
import { BookingEntity } from '../entities/booking.entity';
import { BookingLineEntity } from '../entities/booking-line.entity';
import { toAttendeeEntity, toEntity, toLineEntity } from './typeorm-booking.mapper';

// Split out of typeorm-booking.repository.ts (docs/CODE_STANDARDS.md's file-length limit) — the
// multi-row INSERT behind IBookingRepository.insertMany(). Free function over the caller-supplied
// active EntityManager.
//
// One statement each for the bookings, their lines and (when any exist) their attendees, however
// many bookings there are. The batch is bounded by a recurring schedule's term (at most 365
// occurrences), so every statement stays far inside PostgreSQL's bound-parameter limit.
export async function insertBookingsInBulk(
  manager: EntityManager,
  bookings: Booking[],
): Promise<void> {
  if (bookings.length === 0) return;
  for (const booking of bookings) {
    if (booking.version !== undefined || booking.domainEvents.length > 0) {
      throw new Error(
        'insertMany() only takes new bookings that raise no domain events — use save() instead',
      );
    }
  }

  await manager.insert(
    BookingEntity,
    bookings.map((booking) => toEntity(booking)) as QueryDeepPartialEntity<BookingEntity>[],
  );
  await manager.insert(
    BookingLineEntity,
    bookings.flatMap((booking) =>
      booking.lines.map((line) => toLineEntity(line, booking.id, booking.tenantId)),
    ),
  );
  const attendees = bookings.flatMap((booking) =>
    booking.attendees.map((attendee) => toAttendeeEntity(attendee, booking.id, booking.tenantId)),
  );
  if (attendees.length > 0) await manager.insert(BookingAttendeeEntity, attendees);
  for (const booking of bookings) booking.markPersisted(1);
}
