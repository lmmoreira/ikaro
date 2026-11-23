import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { PlanChanged } from '../../../billing/domain/events/plan-changed.event';
import { SendPlanChangedNotificationUseCase } from '../../application/use-cases/send-plan-changed-notification/send-plan-changed-notification.use-case';

// Declares skipWhenSuspended: false: Billing emails exist for a tenant that may be suspended (UC-124).
@Injectable()
export class PlanChangedNotificationHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'send-plan-changed-notification';

  private readonly logger = new AppLogger(PlanChangedNotificationHandler.name);

  constructor(
    private readonly sendPlanChangedNotification: SendPlanChangedNotificationUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<PlanChanged>(
      PlanChanged.name,
      (event) => this.handle(event),
      PlanChangedNotificationHandler.CONSUMER_NAME,
      { skipWhenSuspended: false },
    );
  }

  async handle(event: PlanChanged): Promise<void> {
    this.logger.log('PlanChanged received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      eventId: event.eventId,
    });
    const d = event.data;
    try {
      await this.sendPlanChangedNotification.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        newTotalMinor: d.newTotalMinor,
        currency: d.currency,
        recipientEmail: d.recipientEmail,
      });
    } catch (err) {
      this.logger.error(
        'PlanChangedNotificationHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}
