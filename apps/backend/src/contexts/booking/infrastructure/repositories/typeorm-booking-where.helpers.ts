import { Between, FindOptionsWhere, In, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { BookingFilters } from '../../application/ports/booking-repository.port';
import { BookingEntity } from '../entities/booking.entity';

// Split out of typeorm-booking.repository.ts to keep it under the file-length cap; a pure function
// of its arguments, so it needs no repository state.
export function buildBookingWhere(
  tenantId: string,
  filters: BookingFilters,
): FindOptionsWhere<BookingEntity> {
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
