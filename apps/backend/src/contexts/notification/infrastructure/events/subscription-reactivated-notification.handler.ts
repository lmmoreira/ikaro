import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { SubscriptionReactivated } from '../../../billing/domain/events/subscription-reactivated.event';
import { SendSubscriptionReactivatedNotificationUseCase } from '../../application/use-cases/send-subscription-reactivated-notification/send-subscription-reactivated-notification.use-case';

// Declares skipWhenSuspended: false: Billing emails exist for a tenant that may be suspended (UC-124).
@Injectable()
export class SubscriptionReactivatedNotificationHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'send-subscription-reactivated-notification';

  private readonly logger = new AppLogger(SubscriptionReactivatedNotificationHandler.name);

  constructor(
    private readonly sendSubscriptionReactivatedNotification: SendSubscriptionReactivatedNotificationUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<SubscriptionReactivated>(
      SubscriptionReactivated.name,
      (event) => this.handle(event),
      SubscriptionReactivatedNotificationHandler.CONSUMER_NAME,
      { skipWhenSuspended: false },
    );
  }

  async handle(event: SubscriptionReactivated): Promise<void> {
    this.logger.log('SubscriptionReactivated received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      eventId: event.eventId,
    });
    const d = event.data;
    try {
      await this.sendSubscriptionReactivatedNotification.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        exempt: d.exempt,
        recipientEmail: d.recipientEmail,
      });
    } catch (err) {
      this.logger.error(
        'SubscriptionReactivatedNotificationHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}
