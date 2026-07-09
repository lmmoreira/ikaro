import { Inject, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { IEventBus, EVENT_BUS } from '../../../../shared/ports/event-bus.port';
import {
  CRON_RUN_LOG_REPOSITORY,
  ICronRunLogRepository,
} from '../../../../shared/ports/cron-run-log-repository.port';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { utcDateToLocalHHMM, utcDateToLocalDate } from '../../../../shared/utils/calendar-date';
import { Booking, BookingStatus } from '../../domain/booking.aggregate';
import { BookingReminderDue } from '../../domain/events/booking-reminder-due.event';
import { BookingReminderDueToday } from '../../domain/events/booking-reminder-due-today.event';
import { BOOKING_REPOSITORY, IBookingRepository } from '../ports/booking-repository.port';
import { BOOKING_CUSTOMER_PORT, IBookingCustomerPort } from '../ports/booking-customer.port';
import { BOOKING_PLATFORM_PORT, IBookingPlatformPort } from '../ports/booking-platform.port';

const WINDOW_START = '06:00';
const WINDOW_END = '06:29';
const REMINDER_TYPE = 'booking-reminder';

@Injectable()
export class BookingReminderJob {
  constructor(
    @Inject(BOOKING_PLATFORM_PORT) private readonly tenantPort: IBookingPlatformPort,
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(BOOKING_CUSTOMER_PORT) private readonly customerProfilePort: IBookingCustomerPort,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(CRON_RUN_LOG_REPOSITORY) private readonly cronRunLogRepo: ICronRunLogRepository,
  ) {}

  async run(now: Date = new Date()): Promise<void> {
    const tenants = await this.tenantPort.findAllActive();

    for (const tenant of tenants) {
      const localHHMM = utcDateToLocalHHMM(now, tenant.timezone);
      if (localHHMM < WINDOW_START || localHHMM > WINDOW_END) continue;

      const localToday = utcDateToLocalDate(now, tenant.timezone);
      // Coarse per-tenant/day idempotency gate — a redelivered trigger for the same window
      // must not re-publish reminder events with fresh eventIds (M17-S03).
      if (await this.cronRunLogRepo.hasRun(tenant.id, localToday, REMINDER_TYPE)) continue;

      const correlationId = uuidv7();
      const localTomorrow = DateTime.fromISO(localToday, { zone: tenant.timezone })
        .plus({ days: 1 })
        .toISODate()!;

      const todayStart = DateTime.fromISO(localToday, { zone: tenant.timezone })
        .startOf('day')
        .toUTC()
        .toJSDate();
      const todayEnd = DateTime.fromISO(localToday, { zone: tenant.timezone })
        .endOf('day')
        .toUTC()
        .toJSDate();
      const tomorrowStart = DateTime.fromISO(localTomorrow, { zone: tenant.timezone })
        .startOf('day')
        .toUTC()
        .toJSDate();
      const tomorrowEnd = DateTime.fromISO(localTomorrow, { zone: tenant.timezone })
        .endOf('day')
        .toUTC()
        .toJSDate();

      const [tomorrowBookings, todayBookings] = await Promise.all([
        this.bookingRepo.findAllByTenant(tenant.id, {
          status: [BookingStatus.APPROVED],
          scheduledAfter: tomorrowStart,
          scheduledBefore: tomorrowEnd,
        }),
        this.bookingRepo.findAllByTenant(tenant.id, {
          status: [BookingStatus.APPROVED],
          scheduledAfter: todayStart,
          scheduledBefore: todayEnd,
        }),
      ]);

      for (const booking of tomorrowBookings) {
        const { email, name } = await this.resolveRecipient(booking, tenant.id);
        await this.eventBus.publish(
          new BookingReminderDue(tenant.id, correlationId, {
            bookingId: booking.id,
            customerId: booking.customerId,
            recipientEmail: email,
            customerName: name,
            scheduledAt: booking.scheduledAt.toISOString(),
            appointmentSlot: this.buildSlot(booking),
            lines: booking.lines.map((l) => ({
              serviceId: l.serviceId,
              serviceName: l.serviceNameAtBooking,
            })),
          }),
        );
      }

      for (const booking of todayBookings) {
        const { email, name } = await this.resolveRecipient(booking, tenant.id);
        await this.eventBus.publish(
          new BookingReminderDueToday(tenant.id, correlationId, {
            bookingId: booking.id,
            customerId: booking.customerId,
            recipientEmail: email,
            customerName: name,
            scheduledAt: booking.scheduledAt.toISOString(),
            appointmentSlot: this.buildSlot(booking),
            lines: booking.lines.map((l) => ({
              serviceId: l.serviceId,
              serviceName: l.serviceNameAtBooking,
            })),
          }),
        );
      }

      await this.cronRunLogRepo.markRun(tenant.id, localToday, REMINDER_TYPE);
    }
  }

  private async resolveRecipient(
    booking: Booking,
    tenantId: string,
  ): Promise<{ email: string; name: string }> {
    if (booking.customerId !== null) {
      const profile = await this.customerProfilePort.findById(booking.customerId, tenantId);
      if (profile) return { email: profile.email, name: profile.name };
    }
    return { email: booking.contactEmail.address, name: booking.contactName };
  }

  private buildSlot(booking: Booking): { startTime: string; endTime: string } {
    const endTime = new Date(booking.scheduledAt.getTime() + booking.totalDurationMins * 60_000);
    return {
      startTime: booking.scheduledAt.toISOString(),
      endTime: endTime.toISOString(),
    };
  }
}
