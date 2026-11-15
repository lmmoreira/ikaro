import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { SubscriptionSuspended } from '../../../billing/domain/events/subscription-suspended.event';
import { RaiseTenantUnavailableNoticesUseCase } from '../../application/use-cases/raise-tenant-unavailable-notices.use-case';

// Declares skipWhenSuspended: false: it runs because of the suspension, and the delivery gate would
// otherwise drop the very event that starts the customer notice (UC-123).
@Injectable()
export class SubscriptionSuspendedTenantUnavailableHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'fan-out-tenant-unavailable-notice';

  private readonly logger = new AppLogger(SubscriptionSuspendedTenantUnavailableHandler.name);

  constructor(
    private readonly raiseTenantUnavailableNotices: RaiseTenantUnavailableNoticesUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<SubscriptionSuspended>(
      SubscriptionSuspended.name,
      (event) => this.handle(event),
      SubscriptionSuspendedTenantUnavailableHandler.CONSUMER_NAME,
      { skipWhenSuspended: false },
    );
  }

  async handle(event: SubscriptionSuspended): Promise<void> {
    this.logger.log('SubscriptionSuspended received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      eventId: event.eventId,
    });
    try {
      await this.raiseTenantUnavailableNotices.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        reason: event.data.reason,
        suspendedAt: event.data.suspendedAt,
      });
    } catch (err) {
      this.logger.error(
        'SubscriptionSuspendedTenantUnavailableHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId, eventId: event.eventId },
      );
      throw err;
    }
  }
}
