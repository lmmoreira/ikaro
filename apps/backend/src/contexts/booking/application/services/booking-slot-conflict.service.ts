import { Inject, Injectable } from '@nestjs/common';
import { utcDateToLocalDate } from '../../../../shared/utils/calendar-date';
import { BookingSlotUnavailableError } from '../../domain/errors/booking-domain.error';
import {
  IBookingAvailabilityPort,
  BOOKING_AVAILABILITY_PORT,
} from '../ports/booking-availability.port';
import { ITenantDayLockPort, TENANT_DAY_LOCK_PORT } from '../ports/tenant-day-lock.port';

@Injectable()
export class BookingSlotConflictService {
  constructor(
    @Inject(BOOKING_AVAILABILITY_PORT)
    private readonly availabilityPort: IBookingAvailabilityPort,
    @Inject(TENANT_DAY_LOCK_PORT)
    private readonly tenantDayLock: ITenantDayLockPort,
  ) {}

  async assertSlotFree(
    tenantId: string,
    scheduledAt: Date,
    totalDurationMins: number,
    timezone: string,
    excludeBookingId?: string,
  ): Promise<void> {
    const localDate = utcDateToLocalDate(scheduledAt, timezone);
    await this.tenantDayLock.lockTenantDay(tenantId, localDate);
    const existing = await this.availabilityPort.findApprovedByTenantAndDate(tenantId, localDate);
    const slots = excludeBookingId ? existing.filter((s) => s.id !== excludeBookingId) : existing;
    const bookingEnd = scheduledAt.getTime() + totalDurationMins * 60_000;
    const hasConflict = slots.some((slot) => {
      const slotEnd = slot.scheduledAt.getTime() + slot.totalDurationMins * 60_000;
      return slot.scheduledAt.getTime() < bookingEnd && scheduledAt.getTime() < slotEnd;
    });
    if (hasConflict) throw new BookingSlotUnavailableError();
  }
}
