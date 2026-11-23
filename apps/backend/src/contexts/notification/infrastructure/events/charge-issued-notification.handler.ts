import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { ChargeIssued } from '../../../billing/domain/events/charge-issued.event';
import { SendChargeIssuedNotificationUseCase } from '../../application/use-cases/send-charge-issued-notification/send-charge-issued-notification.use-case';

// Declares skipWhenSuspended: false: Billing emails exist for a tenant that may be suspended (UC-124).
@Injectable()
export class ChargeIssuedNotificationHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'send-charge-issued-notification';

  private readonly logger = new AppLogger(ChargeIssuedNotificationHandler.name);

  constructor(
    private readonly sendChargeIssuedNotification: SendChargeIssuedNotificationUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<ChargeIssued>(
      ChargeIssued.name,
      (event) => this.handle(event),
      ChargeIssuedNotificationHandler.CONSUMER_NAME,
      { skipWhenSuspended: false },
    );
  }

  async handle(event: ChargeIssued): Promise<void> {
    this.logger.log('ChargeIssued received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      eventId: event.eventId,
    });
    const d = event.data;
    try {
      await this.sendChargeIssuedNotification.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        kind: d.kind,
        dueDate: d.dueDate,
        amountMinor: d.amountMinor,
        currency: d.currency,
        paymentUrl: d.paymentUrl,
        recipientEmail: d.recipientEmail,
      });
    } catch (err) {
      this.logger.error(
        'ChargeIssuedNotificationHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}
