import { Inject, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { IEventBus, EVENT_BUS } from '../../../../shared/ports/event-bus.port';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { utcDateToLocalHHMM, utcDateToLocalDate } from '../../../../shared/utils/calendar-date';
import { Booking, BookingStatus } from '../../domain/booking.aggregate';
import { AdminDailyScheduleReminder } from '../../domain/commands/admin-daily-schedule-reminder.command';
import { BOOKING_REPOSITORY, IBookingRepository } from '../ports/booking-repository.port';
import { BOOKING_CUSTOMER_PORT, IBookingCustomerPort } from '../ports/booking-customer.port';
import { BOOKING_PLATFORM_PORT, IBookingPlatformPort } from '../ports/booking-platform.port';

const WINDOW_START = '06:00';
const WINDOW_END = '06:29';

@Injectable()
export class AdminScheduleReminderJob {
  constructor(
    @Inject(BOOKING_PLATFORM_PORT) private readonly tenantPort: IBookingPlatformPort,
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(BOOKING_CUSTOMER_PORT) private readonly customerProfilePort: IBookingCustomerPort,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  async run(now: Date = new Date()): Promise<void> {
    const tenants = await this.tenantPort.findAllActive();

    for (const tenant of tenants) {
      const localHHMM = utcDateToLocalHHMM(now, tenant.timezone);
      if (localHHMM < WINDOW_START || localHHMM > WINDOW_END) continue;

      const correlationId = uuidv7();
      const localToday = utcDateToLocalDate(now, tenant.timezone);
      const todayStart = DateTime.fromISO(localToday, { zone: tenant.timezone })
        .startOf('day')
        .toUTC()
        .toJSDate();
      const todayEnd = DateTime.fromISO(localToday, { zone: tenant.timezone })
        .endOf('day')
        .toUTC()
        .toJSDate();

      const todayBookings = await this.bookingRepo.findAllByTenant(tenant.id, {
        status: [BookingStatus.APPROVED],
        scheduledAfter: todayStart,
        scheduledBefore: todayEnd,
      });

      const bookingsToday = await Promise.all(
        todayBookings.map((b) => this.buildDigestBooking(b, tenant.id)),
      );

      await this.eventBus.publish(
        new AdminDailyScheduleReminder(tenant.id, correlationId, {
          localDate: localToday,
          bookingsToday,
          totalBookingsToday: bookingsToday.length,
        }),
      );
    }
  }

  private async buildDigestBooking(
    booking: Booking,
    tenantId: string,
  ): Promise<{
    bookingId: string;
    customerName: string;
    customerPhone: string | null;
    lines: { serviceId: string; serviceName: string }[];
    appointmentSlot: { startTime: string; endTime: string };
    adminNotes: string | null;
  }> {
    let customerName = booking.contactName;
    let customerPhone: string | null = booking.contactPhone.value;

    if (booking.customerId !== null) {
      const profile = await this.customerProfilePort.findById(booking.customerId, tenantId);
      if (profile) {
        customerName = profile.name;
        customerPhone = profile.phone;
      }
    }

    const endTime = new Date(booking.scheduledAt.getTime() + booking.totalDurationMins * 60_000);

    return {
      bookingId: booking.id,
      customerName,
      customerPhone,
      lines: booking.lines.map((l) => ({
        serviceId: l.serviceId,
        serviceName: l.serviceNameAtBooking,
      })),
      appointmentSlot: {
        startTime: booking.scheduledAt.toISOString(),
        endTime: endTime.toISOString(),
      },
      adminNotes: booking.adminNotes,
    };
  }
}
