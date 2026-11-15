import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { SubscriptionReactivated } from '../../../billing/domain/events/subscription-reactivated.event';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { CloseTenantExpiryPauseUseCase } from '../../application/use-cases/close-tenant-expiry-pause/close-tenant-expiry-pause.use-case';

// Loyalty resumes its points expiring once the tenant is reactivated (UC-121 O-L1). It declares
// `skipWhenSuspended: false`: the tenant may still read as suspended while the event is delivered.
@Injectable()
export class SubscriptionReactivatedLoyaltyHandler implements OnModuleInit {
  private readonly logger = new AppLogger(SubscriptionReactivatedLoyaltyHandler.name);

  constructor(
    private readonly closeTenantExpiryPause: CloseTenantExpiryPauseUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<SubscriptionReactivated>(
      SubscriptionReactivated.name,
      (event) => this.handle(event),
      CloseTenantExpiryPauseUseCase.CONSUMER_NAME,
      { skipWhenSuspended: false },
    );
  }

  async handle(event: SubscriptionReactivated): Promise<void> {
    try {
      await this.closeTenantExpiryPause.execute({
        tenantId: event.tenantId,
        suspendedAt: new Date(event.data.suspendedAt),
        reactivatedAt: new Date(event.data.reactivatedAt),
        correlationId: event.correlationId,
      });
    } catch (err) {
      this.logger.error(
        'SubscriptionReactivatedLoyaltyHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}
