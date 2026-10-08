import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { RecurringBookingScheduleEnded } from '../../../booking/domain/events/recurring-booking-schedule-ended.event';
import { SendRecurringScheduleEndedNotificationUseCase } from '../../application/use-cases/send-recurring-schedule-ended-notification/send-recurring-schedule-ended-notification.use-case';

@Injectable()
export class RecurringScheduleEndedNotificationHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'notification';

  private readonly logger = new AppLogger(RecurringScheduleEndedNotificationHandler.name);

  constructor(
    private readonly sendRecurringScheduleEndedNotification: SendRecurringScheduleEndedNotificationUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<RecurringBookingScheduleEnded>(
      RecurringBookingScheduleEnded.name,
      (event) => this.handle(event),
      RecurringScheduleEndedNotificationHandler.CONSUMER_NAME,
    );
  }

  async handle(event: RecurringBookingScheduleEnded): Promise<void> {
    this.logger.log('RecurringBookingScheduleEnded received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      recurringScheduleId: event.data.recurringScheduleId,
    });
    try {
      await this.sendRecurringScheduleEndedNotification.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        customerId: event.data.customerId,
        serviceId: event.data.serviceId,
        endedBy: event.data.endedBy,
      });
    } catch (err) {
      this.logger.error(
        'RecurringScheduleEndedNotificationHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}
