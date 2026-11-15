import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { SubscriptionSuspended } from '../../../billing/domain/events/subscription-suspended.event';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { RecordTenantExpiryPauseUseCase } from '../../application/use-cases/record-tenant-expiry-pause/record-tenant-expiry-pause.use-case';

// Loyalty stops its points expiring while the tenant is suspended (UC-121 O-L1). It declares
// `skipWhenSuspended: false`: it records the suspension itself, so the gate must not drop it.
@Injectable()
export class SubscriptionSuspendedLoyaltyHandler implements OnModuleInit {
  private readonly logger = new AppLogger(SubscriptionSuspendedLoyaltyHandler.name);

  constructor(
    private readonly recordTenantExpiryPause: RecordTenantExpiryPauseUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<SubscriptionSuspended>(
      SubscriptionSuspended.name,
      (event) => this.handle(event),
      RecordTenantExpiryPauseUseCase.CONSUMER_NAME,
      { skipWhenSuspended: false },
    );
  }

  async handle(event: SubscriptionSuspended): Promise<void> {
    try {
      await this.recordTenantExpiryPause.execute({
        tenantId: event.tenantId,
        suspendedAt: new Date(event.data.suspendedAt),
        correlationId: event.correlationId,
      });
    } catch (err) {
      this.logger.error(
        'SubscriptionSuspendedLoyaltyHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}
