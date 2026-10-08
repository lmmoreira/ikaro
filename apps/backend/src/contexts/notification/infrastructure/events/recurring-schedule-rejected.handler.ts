import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { RecurringBookingScheduleRejected } from '../../../booking/domain/events/recurring-booking-schedule-rejected.event';
import { SendRecurringScheduleRejectedNotificationUseCase } from '../../application/use-cases/send-recurring-schedule-rejected-notification/send-recurring-schedule-rejected-notification.use-case';

@Injectable()
export class RecurringScheduleRejectedNotificationHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'notification';

  private readonly logger = new AppLogger(RecurringScheduleRejectedNotificationHandler.name);

  constructor(
    private readonly sendRecurringScheduleRejectedNotification: SendRecurringScheduleRejectedNotificationUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<RecurringBookingScheduleRejected>(
      RecurringBookingScheduleRejected.name,
      (event) => this.handle(event),
      RecurringScheduleRejectedNotificationHandler.CONSUMER_NAME,
    );
  }

  async handle(event: RecurringBookingScheduleRejected): Promise<void> {
    this.logger.log('RecurringBookingScheduleRejected received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      recurringScheduleId: event.data.recurringScheduleId,
    });
    try {
      await this.sendRecurringScheduleRejectedNotification.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        customerId: event.data.customerId,
        serviceId: event.data.serviceId,
        reason: event.data.reason,
      });
    } catch (err) {
      this.logger.error(
        'RecurringScheduleRejectedNotificationHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}
