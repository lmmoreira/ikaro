import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { IOutboxPublisher, OUTBOX_PUBLISHER } from '../../../../shared/ports/outbox-publisher.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { addDaysUTC, utcDateToLocalDate } from '../../../../shared/utils/calendar-date';
import { mapSequentially } from '../../../../shared/utils/sequential';
import { RecurringScheduleRenewalDue } from '../../domain/commands/recurring-schedule-renewal-due.command';
import { isRenewalReminderDue } from '../services/recurring-schedule-renewal.rules';
import { BOOKING_PLATFORM_PORT, IBookingPlatformPort } from '../ports/booking-platform.port';
import {
  IRecurringBookingScheduleRepository,
  RECURRING_BOOKING_SCHEDULE_REPOSITORY,
} from '../ports/recurring-booking-schedule-repository.port';
import { REMINDER_WINDOW, WindowedTenant, WindowedTenantJob } from './tenant-local-window';

// UC-070 (M23-S21): one renewal reminder per ending recurring schedule, in each tenant's own
// 06:00–06:29 window (the same window BookingReminderJob uses). It matches the exact date
// `endsOn = localToday + N` rather than "within N days", which is what makes it idempotent without
// a "sent" column: the Command's dedup key is (tenant, schedule, localDate), so a retried or
// overlapping tick cannot send twice. N is the tenant's `recurringRenewalReminderDays`; 0 turns
// the reminder off. A customer who already holds a successor schedule is not reminded.
@Injectable()
export class RecurringScheduleRenewalReminderJob extends WindowedTenantJob {
  protected readonly window = REMINDER_WINDOW;
  protected readonly label = 'Renewal reminder';

  constructor(
    @Inject(BOOKING_PLATFORM_PORT) private readonly tenantPort: IBookingPlatformPort,
    @Inject(RECURRING_BOOKING_SCHEDULE_REPOSITORY)
    private readonly scheduleRepo: IRecurringBookingScheduleRepository,
    @Inject(OUTBOX_PUBLISHER) private readonly outboxPublisher: IOutboxPublisher,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {
    super();
  }

  protected findTenants(): Promise<WindowedTenant[]> {
    return this.tenantPort.findAllActive();
  }

  protected async processTenant(tenant: WindowedTenant, now: Date): Promise<void> {
    const { reminderDays } = await this.tenantPort.getRecurringRenewalSettings(tenant.id);
    if (reminderDays <= 0) return;

    const localToday = utcDateToLocalDate(now, tenant.timezone);
    const endingOnTarget = await this.scheduleRepo.findActiveEndingOn(
      tenant.id,
      addDaysUTC(localToday, reminderDays),
    );
    const due = endingOnTarget.filter((s) => isRenewalReminderDue(s, localToday, reminderDays));
    if (due.length === 0) return;

    const withSuccessor = await this.scheduleRepo.findSuccessorScheduleIds(tenant.id, due);
    const correlationId = uuidv7();
    const commands = due
      .filter((s) => !withSuccessor.has(s.id))
      .map(
        (s) =>
          new RecurringScheduleRenewalDue(
            tenant.id,
            correlationId,
            {
              recurringScheduleId: s.id,
              customerId: s.customerId,
              serviceId: s.serviceId,
              daysOfWeek: [...s.recurrence.daysOfWeek],
              startTime: s.recurrence.startTime,
              startsOn: s.startsOn,
              endsOn: s.endsOn,
            },
            localToday,
          ),
      );

    // One transaction per tenant batch: a mid-run crash retries only this tenant's un-committed
    // rows as no-op conflicts on the next tick. Every read above ran before it opened.
    await this.txManager.run(async () => {
      await mapSequentially(commands, (command) => this.outboxPublisher.publish(command));
    });
  }
}
