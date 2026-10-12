import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { utcDateToLocalDate } from '../../../../shared/utils/calendar-date';
import { Booking, BookingStatus } from '../../domain/booking.aggregate';
import { AdminDailyScheduleReminder } from '../../domain/commands/admin-daily-schedule-reminder.command';
import { BookingDayReminderJobBase } from './booking-day-reminder-job.base';
import { REMINDER_WINDOW } from './tenant-local-window';
import { WindowedTenant } from './windowed-tenant.job';

@Injectable()
export class AdminScheduleReminderJob extends BookingDayReminderJobBase {
  protected readonly window = REMINDER_WINDOW;
  protected readonly label = 'Admin schedule reminder';

  protected async processTenant(tenant: WindowedTenant, now: Date): Promise<void> {
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

    const reminder = new AdminDailyScheduleReminder(tenant.id, correlationId, {
      localDate: localToday,
      bookingsToday,
      totalBookingsToday: bookingsToday.length,
    });

    // One transaction per tenant-batch (see booking-reminder.job.ts for the rationale).
    await this.txManager.run(() => this.outboxPublisher.publish(reminder));
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
