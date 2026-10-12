import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { utcDateToLocalDate } from '../../../../shared/utils/calendar-date';
import { mapSequentially } from '../../../../shared/utils/sequential';
import { Booking, BookingStatus } from '../../domain/booking.aggregate';
import { BookingReminderDue } from '../../domain/commands/booking-reminder-due.command';
import { BookingReminderDueToday } from '../../domain/commands/booking-reminder-due-today.command';
import { BookingDayReminderJobBase } from './booking-day-reminder-job.base';
import { REMINDER_WINDOW } from './tenant-local-window';
import { WindowedTenant } from './windowed-tenant.job';

interface ReminderData extends Record<string, unknown> {
  bookingId: string;
  customerId: string | null;
  recipientEmail: string;
  customerName: string;
  scheduledAt: string;
  appointmentSlot: { startTime: string; endTime: string };
  lines: { serviceId: string; serviceName: string }[];
}

type ReminderCtor<T> = new (
  tenantId: string,
  correlationId: string,
  data: ReminderData,
  localDate: string,
) => T;

@Injectable()
export class BookingReminderJob extends BookingDayReminderJobBase {
  protected readonly window = REMINDER_WINDOW;
  protected readonly label = 'Booking reminder';

  protected async processTenant(tenant: WindowedTenant, now: Date): Promise<void> {
    const correlationId = uuidv7();
    const localToday = utcDateToLocalDate(now, tenant.timezone);
    const localTomorrow = DateTime.fromISO(localToday, { zone: tenant.timezone })
      .plus({ days: 1 })
      .toISODate()!;

    const { tomorrowBookings, todayBookings } = await this.findReminderBookings(
      tenant.id,
      tenant.timezone,
      localToday,
      localTomorrow,
    );

    // Recipient lookups are reads against a cross-context port — resolved before the tenant's
    // outbox-write transaction opens, not inside it (CLAUDE.md: reads before txManager.run()).
    // Sequential, not Promise.all: a tenant with many bookings would otherwise fan out one
    // concurrent customer-profile lookup per booking, spiking DB/connection-pool load.
    const tomorrowReminders = await this.buildReminders(
      tomorrowBookings,
      tenant.id,
      correlationId,
      localTomorrow,
      BookingReminderDue,
    );
    const todayReminders = await this.buildReminders(
      todayBookings,
      tenant.id,
      correlationId,
      localToday,
      BookingReminderDueToday,
    );

    // One transaction per tenant-batch, not one giant transaction across all tenants: a
    // mid-run crash then retries only this tenant's un-committed facts as no-op conflicts
    // on the next run, leaving every other tenant's already-committed rows untouched.
    await this.txManager.run(async () => {
      await mapSequentially([...tomorrowReminders, ...todayReminders], (reminder) =>
        this.outboxPublisher.publish(reminder),
      );
    });
  }

  private async findReminderBookings(
    tenantId: string,
    timezone: string,
    localToday: string,
    localTomorrow: string,
  ): Promise<{ tomorrowBookings: Booking[]; todayBookings: Booking[] }> {
    const todayStart = DateTime.fromISO(localToday, { zone: timezone })
      .startOf('day')
      .toUTC()
      .toJSDate();
    const todayEnd = DateTime.fromISO(localToday, { zone: timezone })
      .endOf('day')
      .toUTC()
      .toJSDate();
    const tomorrowStart = DateTime.fromISO(localTomorrow, { zone: timezone })
      .startOf('day')
      .toUTC()
      .toJSDate();
    const tomorrowEnd = DateTime.fromISO(localTomorrow, { zone: timezone })
      .endOf('day')
      .toUTC()
      .toJSDate();

    const [tomorrowBookings, todayBookings] = await Promise.all([
      this.bookingRepo.findAllByTenant(tenantId, {
        status: [BookingStatus.APPROVED],
        scheduledAfter: tomorrowStart,
        scheduledBefore: tomorrowEnd,
      }),
      this.bookingRepo.findAllByTenant(tenantId, {
        status: [BookingStatus.APPROVED],
        scheduledAfter: todayStart,
        scheduledBefore: todayEnd,
      }),
    ]);
    return { tomorrowBookings, todayBookings };
  }

  private async buildReminders<T extends BookingReminderDue | BookingReminderDueToday>(
    bookings: Booking[],
    tenantId: string,
    correlationId: string,
    localDate: string,
    ReminderCtor: ReminderCtor<T>,
  ): Promise<T[]> {
    return mapSequentially(bookings, async (booking) => {
      const { email, name } = await this.resolveRecipient(booking, tenantId);
      const data = this.buildReminderData(booking, email, name);
      return new ReminderCtor(tenantId, correlationId, data, localDate);
    });
  }

  private buildReminderData(booking: Booking, email: string, name: string): ReminderData {
    return {
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
    };
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
