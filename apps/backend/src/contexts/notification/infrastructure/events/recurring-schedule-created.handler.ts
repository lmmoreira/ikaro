import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { RecurringBookingScheduleCreated } from '../../../booking/domain/events/recurring-booking-schedule-created.event';
import { SendRecurringScheduleCreatedNotificationUseCase } from '../../application/use-cases/send-recurring-schedule-created-notification/send-recurring-schedule-created-notification.use-case';

@Injectable()
export class RecurringScheduleCreatedNotificationHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'notification';

  private readonly logger = new AppLogger(RecurringScheduleCreatedNotificationHandler.name);

  constructor(
    private readonly sendRecurringScheduleCreatedNotification: SendRecurringScheduleCreatedNotificationUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<RecurringBookingScheduleCreated>(
      RecurringBookingScheduleCreated.name,
      (event) => this.handle(event),
      RecurringScheduleCreatedNotificationHandler.CONSUMER_NAME,
    );
  }

  async handle(event: RecurringBookingScheduleCreated): Promise<void> {
    this.logger.log('RecurringBookingScheduleCreated received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      recurringScheduleId: event.data.recurringScheduleId,
    });
    try {
      await this.sendRecurringScheduleCreatedNotification.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        customerId: event.data.customerId,
        serviceId: event.data.serviceId,
        daysOfWeek: event.data.recurrence.daysOfWeek,
        startTime: event.data.recurrence.startTime,
        startsOn: event.data.startsOn,
        endsOn: event.data.endsOn,
      });
    } catch (err) {
      this.logger.error(
        'RecurringScheduleCreatedNotificationHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}
