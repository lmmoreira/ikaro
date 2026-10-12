import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { RecurringScheduleRenewalDue } from '../../../booking/domain/commands/recurring-schedule-renewal-due.command';
import { SendRecurringScheduleRenewalNotificationUseCase } from '../../application/use-cases/send-recurring-schedule-renewal-notification/send-recurring-schedule-renewal-notification.use-case';

@Injectable()
export class RecurringScheduleRenewalNotificationHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'notification';

  private readonly logger = new AppLogger(RecurringScheduleRenewalNotificationHandler.name);

  constructor(
    private readonly sendRecurringScheduleRenewalNotification: SendRecurringScheduleRenewalNotificationUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<RecurringScheduleRenewalDue>(
      RecurringScheduleRenewalDue.name,
      (event) => this.handle(event),
      RecurringScheduleRenewalNotificationHandler.CONSUMER_NAME,
    );
  }

  async handle(event: RecurringScheduleRenewalDue): Promise<void> {
    this.logger.log('RecurringScheduleRenewalDue received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      recurringScheduleId: event.data.recurringScheduleId,
    });
    try {
      await this.sendRecurringScheduleRenewalNotification.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        recurringScheduleId: event.data.recurringScheduleId,
        customerId: event.data.customerId,
        serviceId: event.data.serviceId,
        daysOfWeek: event.data.daysOfWeek,
        startTime: event.data.startTime,
        startsOn: event.data.startsOn,
        endsOn: event.data.endsOn,
      });
    } catch (err) {
      this.logger.error(
        'RecurringScheduleRenewalNotificationHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}
