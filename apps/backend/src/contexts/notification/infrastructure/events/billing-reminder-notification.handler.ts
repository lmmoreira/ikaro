import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { BillingReminderDue } from '../../../billing/domain/commands/billing-reminder-due.command';
import { SendBillingReminderNotificationUseCase } from '../../application/use-cases/send-billing-reminder-notification/send-billing-reminder-notification.use-case';

// Declares skipWhenSuspended: false: Billing emails exist for a tenant that may be suspended (UC-124).
@Injectable()
export class BillingReminderNotificationHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'send-billing-reminder-notification';

  private readonly logger = new AppLogger(BillingReminderNotificationHandler.name);

  constructor(
    private readonly sendBillingReminderNotification: SendBillingReminderNotificationUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<BillingReminderDue>(
      BillingReminderDue.name,
      (event) => this.handle(event),
      BillingReminderNotificationHandler.CONSUMER_NAME,
      { skipWhenSuspended: false },
    );
  }

  async handle(event: BillingReminderDue): Promise<void> {
    this.logger.log('BillingReminderDue received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      eventId: event.eventId,
    });
    const d = event.data;
    try {
      await this.sendBillingReminderNotification.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        kind: d.kind,
        dueDate: d.dueDate,
        trialEndsOn: d.trialEndsOn,
        suspendsOn: d.suspendsOn,
        amountMinor: d.amountMinor,
        currency: d.currency,
        recipientEmail: d.recipientEmail,
      });
    } catch (err) {
      this.logger.error(
        'BillingReminderNotificationHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}
