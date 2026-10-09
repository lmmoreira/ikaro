import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { AvailabilityAlertMatched } from '../../../booking/domain/events/availability-alert-matched.event';
import { SendAvailabilityAlertMatchedNotificationUseCase } from '../../application/use-cases/send-availability-alert-matched-notification/send-availability-alert-matched-notification.use-case';

@Injectable()
export class AvailabilityAlertMatchedNotificationHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'notification';

  private readonly logger = new AppLogger(AvailabilityAlertMatchedNotificationHandler.name);

  constructor(
    private readonly sendAvailabilityAlertMatchedNotification: SendAvailabilityAlertMatchedNotificationUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<AvailabilityAlertMatched>(
      AvailabilityAlertMatched.name,
      (event) => this.handle(event),
      AvailabilityAlertMatchedNotificationHandler.CONSUMER_NAME,
    );
  }

  async handle(event: AvailabilityAlertMatched): Promise<void> {
    this.logger.log('AvailabilityAlertMatched received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      alertId: event.data.alertId,
    });
    try {
      await this.sendAvailabilityAlertMatchedNotification.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        customerId: event.data.customerId,
        serviceId: event.data.serviceId,
        alertId: event.data.alertId,
        matchingWindowStart: event.data.matchingWindowStart,
        matchingWindowEnd: event.data.matchingWindowEnd,
      });
    } catch (err) {
      this.logger.error(
        'AvailabilityAlertMatchedNotificationHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}
