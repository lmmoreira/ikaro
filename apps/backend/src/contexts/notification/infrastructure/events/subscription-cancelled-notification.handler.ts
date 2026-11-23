import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { SubscriptionCancelled } from '../../../billing/domain/events/subscription-cancelled.event';
import { SendSubscriptionCancelledNotificationUseCase } from '../../application/use-cases/send-subscription-cancelled-notification/send-subscription-cancelled-notification.use-case';

// Declares skipWhenSuspended: false: Billing emails exist for a tenant that may be suspended (UC-124).
@Injectable()
export class SubscriptionCancelledNotificationHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'send-subscription-cancelled-notification';

  private readonly logger = new AppLogger(SubscriptionCancelledNotificationHandler.name);

  constructor(
    private readonly sendSubscriptionCancelledNotification: SendSubscriptionCancelledNotificationUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<SubscriptionCancelled>(
      SubscriptionCancelled.name,
      (event) => this.handle(event),
      SubscriptionCancelledNotificationHandler.CONSUMER_NAME,
      { skipWhenSuspended: false },
    );
  }

  async handle(event: SubscriptionCancelled): Promise<void> {
    this.logger.log('SubscriptionCancelled received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      eventId: event.eventId,
    });
    const d = event.data;
    try {
      await this.sendSubscriptionCancelledNotification.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        immediate: d.immediate,
        cancelAt: d.cancelAt,
        recipientEmail: d.recipientEmail,
      });
    } catch (err) {
      this.logger.error(
        'SubscriptionCancelledNotificationHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}
