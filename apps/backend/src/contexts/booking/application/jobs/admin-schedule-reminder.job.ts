import { Inject, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { IOutboxPublisher, OUTBOX_PUBLISHER } from '../../../../shared/ports/outbox-publisher.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { utcDateToLocalDate } from '../../../../shared/utils/calendar-date';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { Booking, BookingStatus } from '../../domain/booking.aggregate';
import { AdminDailyScheduleReminder } from '../../domain/commands/admin-daily-schedule-reminder.command';
import { BOOKING_REPOSITORY, IBookingRepository } from '../ports/booking-repository.port';
import { BOOKING_CUSTOMER_PORT, IBookingCustomerPort } from '../ports/booking-customer.port';
import { BOOKING_PLATFORM_PORT, IBookingPlatformPort } from '../ports/booking-platform.port';
import { forEachTenantInWindow, REMINDER_WINDOW } from './tenant-local-window';

@Injectable()
export class AdminScheduleReminderJob {
  private readonly logger = new AppLogger(AdminScheduleReminderJob.name);

  constructor(
    @Inject(BOOKING_PLATFORM_PORT) private readonly tenantPort: IBookingPlatformPort,
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(BOOKING_CUSTOMER_PORT) private readonly customerProfilePort: IBookingCustomerPort,
    @Inject(OUTBOX_PUBLISHER) private readonly outboxPublisher: IOutboxPublisher,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async run(now: Date = new Date()): Promise<void> {
    const tenants = await this.tenantPort.findAllActive();

    await forEachTenantInWindow(
      tenants,
      now,
      REMINDER_WINDOW,
      { logger: this.logger, label: 'Admin schedule reminder' },
      (tenant) => this.processTenant(tenant, now),
    );
  }

  private async processTenant(tenant: { id: string; timezone: string }, now: Date): Promise<void> {
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
