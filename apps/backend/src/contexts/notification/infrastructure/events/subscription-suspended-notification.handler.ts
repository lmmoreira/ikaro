import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { SubscriptionSuspended } from '../../../billing/domain/events/subscription-suspended.event';
import { SendSubscriptionSuspendedNotificationUseCase } from '../../application/use-cases/send-subscription-suspended-notification/send-subscription-suspended-notification.use-case';

// Declares skipWhenSuspended: false: Billing emails exist for a tenant that may be suspended (UC-124).
@Injectable()
export class SubscriptionSuspendedNotificationHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'send-subscription-suspended-notification';

  private readonly logger = new AppLogger(SubscriptionSuspendedNotificationHandler.name);

  constructor(
    private readonly sendSubscriptionSuspendedNotification: SendSubscriptionSuspendedNotificationUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<SubscriptionSuspended>(
      SubscriptionSuspended.name,
      (event) => this.handle(event),
      SubscriptionSuspendedNotificationHandler.CONSUMER_NAME,
      { skipWhenSuspended: false },
    );
  }

  async handle(event: SubscriptionSuspended): Promise<void> {
    this.logger.log('SubscriptionSuspended received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      eventId: event.eventId,
    });
    const d = event.data;
    try {
      await this.sendSubscriptionSuspendedNotification.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        reason: d.reason,
        purgeAt: d.purgeAt,
        recipientEmail: d.recipientEmail,
      });
    } catch (err) {
      this.logger.error(
        'SubscriptionSuspendedNotificationHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}
