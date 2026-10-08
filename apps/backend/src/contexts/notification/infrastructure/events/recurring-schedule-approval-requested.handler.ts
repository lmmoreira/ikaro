import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { RecurringBookingScheduleApprovalRequested } from '../../../booking/domain/events/recurring-booking-schedule-approval-requested.event';
import { SendRecurringScheduleApprovalRequestedNotificationUseCase } from '../../application/use-cases/send-recurring-schedule-approval-requested-notification/send-recurring-schedule-approval-requested-notification.use-case';

@Injectable()
export class RecurringScheduleApprovalRequestedNotificationHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'notification';

  private readonly logger = new AppLogger(
    RecurringScheduleApprovalRequestedNotificationHandler.name,
  );

  constructor(
    private readonly sendRecurringScheduleApprovalRequestedNotification: SendRecurringScheduleApprovalRequestedNotificationUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<RecurringBookingScheduleApprovalRequested>(
      RecurringBookingScheduleApprovalRequested.name,
      (event) => this.handle(event),
      RecurringScheduleApprovalRequestedNotificationHandler.CONSUMER_NAME,
    );
  }

  async handle(event: RecurringBookingScheduleApprovalRequested): Promise<void> {
    this.logger.log('RecurringBookingScheduleApprovalRequested received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      recurringScheduleId: event.data.recurringScheduleId,
    });
    try {
      await this.sendRecurringScheduleApprovalRequestedNotification.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        customerId: event.data.customerId,
        serviceId: event.data.serviceId,
        daysOfWeek: event.data.recurrence.daysOfWeek,
        startTime: event.data.recurrence.startTime,
        startsOn: event.data.startsOn,
        endsOn: event.data.endsOn,
        approvalHoldExpiresAt: event.data.approvalHoldExpiresAt,
      });
    } catch (err) {
      this.logger.error(
        'RecurringScheduleApprovalRequestedNotificationHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}
