import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { SubscriptionPriceChangeAnnounced } from '../../../billing/domain/events/subscription-price-change-announced.event';
import { SendPriceChangeAnnouncedNotificationUseCase } from '../../application/use-cases/send-price-change-announced-notification/send-price-change-announced-notification.use-case';

// Declares skipWhenSuspended: false: Billing emails exist for a tenant that may be suspended (UC-124).
@Injectable()
export class PriceChangeAnnouncedNotificationHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'send-price-change-announced-notification';

  private readonly logger = new AppLogger(PriceChangeAnnouncedNotificationHandler.name);

  constructor(
    private readonly sendPriceChangeAnnouncedNotification: SendPriceChangeAnnouncedNotificationUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<SubscriptionPriceChangeAnnounced>(
      SubscriptionPriceChangeAnnounced.name,
      (event) => this.handle(event),
      PriceChangeAnnouncedNotificationHandler.CONSUMER_NAME,
      { skipWhenSuspended: false },
    );
  }

  async handle(event: SubscriptionPriceChangeAnnounced): Promise<void> {
    this.logger.log('SubscriptionPriceChangeAnnounced received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      eventId: event.eventId,
    });
    const d = event.data;
    try {
      await this.sendPriceChangeAnnouncedNotification.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        changes: d.changes,
        currency: d.currency,
        effectiveFrom: d.effectiveFrom,
        newMonthlyTotalMinor: d.newMonthlyTotalMinor,
        recipientEmail: d.recipientEmail,
      });
    } catch (err) {
      this.logger.error(
        'PriceChangeAnnouncedNotificationHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}
