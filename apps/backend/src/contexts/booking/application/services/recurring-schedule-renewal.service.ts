import { Inject, Injectable } from '@nestjs/common';
import { todayInTimezone } from '../../../../shared/utils/calendar-date';
import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import { isRenewalOffered } from '../../domain/recurring-schedule-renewal';
import { BOOKING_PLATFORM_PORT, IBookingPlatformPort } from '../ports/booking-platform.port';
import {
  IRecurringBookingScheduleRepository,
  RECURRING_BOOKING_SCHEDULE_REPOSITORY,
} from '../ports/recurring-booking-schedule-repository.port';

// M23-S21: the one place that decides `renewable` for the schedule list and the by-id read, so the
// two cannot drift (docs/27 § Renewal window and reminder). A customer cannot read the tenant
// settings the window comes from, which is why the server computes it.
@Injectable()
export class RecurringScheduleRenewalService {
  constructor(
    @Inject(BOOKING_PLATFORM_PORT) private readonly platformPort: IBookingPlatformPort,
    @Inject(RECURRING_BOOKING_SCHEDULE_REPOSITORY)
    private readonly scheduleRepo: IRecurringBookingScheduleRepository,
  ) {}

  /** The ids, among these schedules, that the customer can renew right now. */
  async findRenewableIds(
    tenantId: string,
    schedules: readonly RecurringBookingSchedule[],
    now: Date = new Date(),
  ): Promise<Set<string>> {
    if (schedules.length === 0) return new Set();
    const { timezone, reminderDays } =
      await this.platformPort.getRecurringRenewalSettings(tenantId);
    const localToday = todayInTimezone(timezone, now);
    const offered = schedules.filter((s) => isRenewalOffered(s, localToday, reminderDays));
    // Only schedules inside the window or ended need the successor read; skip it when none is.
    if (offered.length === 0) return new Set();
    const withSuccessor = await this.scheduleRepo.findSuccessorScheduleIds(tenantId, offered);
    return new Set(offered.filter((s) => !withSuccessor.has(s.id)).map((s) => s.id));
  }
}
