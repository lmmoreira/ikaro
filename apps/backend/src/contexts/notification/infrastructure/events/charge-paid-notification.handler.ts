import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { ChargePaid } from '../../../billing/domain/events/charge-paid.event';
import { SendChargePaidNotificationUseCase } from '../../application/use-cases/send-charge-paid-notification/send-charge-paid-notification.use-case';

// Declares skipWhenSuspended: false: Billing emails exist for a tenant that may be suspended (UC-124).
@Injectable()
export class ChargePaidNotificationHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'send-charge-paid-notification';

  private readonly logger = new AppLogger(ChargePaidNotificationHandler.name);

  constructor(
    private readonly sendChargePaidNotification: SendChargePaidNotificationUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<ChargePaid>(
      ChargePaid.name,
      (event) => this.handle(event),
      ChargePaidNotificationHandler.CONSUMER_NAME,
      { skipWhenSuspended: false },
    );
  }

  async handle(event: ChargePaid): Promise<void> {
    this.logger.log('ChargePaid received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      eventId: event.eventId,
    });
    const d = event.data;
    try {
      await this.sendChargePaidNotification.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        amountMinor: d.amountMinor,
        currency: d.currency,
        paidAt: d.paidAt,
        recipientEmail: d.recipientEmail,
      });
    } catch (err) {
      this.logger.error(
        'ChargePaidNotificationHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}
