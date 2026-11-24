import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { SubscriptionPastDue } from '../../../billing/domain/events/subscription-past-due.event';
import { SendSubscriptionPastDueNotificationUseCase } from '../../application/use-cases/send-subscription-past-due-notification/send-subscription-past-due-notification.use-case';

// Declares skipWhenSuspended: false: Billing emails exist for a tenant that may be suspended (UC-124).
@Injectable()
export class SubscriptionPastDueNotificationHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'send-subscription-past-due-notification';

  private readonly logger = new AppLogger(SubscriptionPastDueNotificationHandler.name);

  constructor(
    private readonly sendSubscriptionPastDueNotification: SendSubscriptionPastDueNotificationUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<SubscriptionPastDue>(
      SubscriptionPastDue.name,
      (event) => this.handle(event),
      SubscriptionPastDueNotificationHandler.CONSUMER_NAME,
      { skipWhenSuspended: false },
    );
  }

  async handle(event: SubscriptionPastDue): Promise<void> {
    this.logger.log('SubscriptionPastDue received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      eventId: event.eventId,
    });
    const d = event.data;
    try {
      await this.sendSubscriptionPastDueNotification.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        suspendsAt: d.suspendsAt,
        recipientEmail: d.recipientEmail,
      });
    } catch (err) {
      this.logger.error(
        'SubscriptionPastDueNotificationHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}
