import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { TenantProvisioned } from '../../../platform/domain/events/tenant-provisioned.event';
import { CreateTrialSubscriptionUseCase } from '../../application/use-cases/create-trial-subscription.use-case';

// Billing starts the tenant's subscription (UC-110). The consumer name lives on the use case, which
// also uses it as its inbox key. The class name is unique across the codebase on purpose: the
// Pub/Sub catalog generator keys static properties by bare class name.
@Injectable()
export class TenantProvisionedBillingHandler implements OnModuleInit {
  private readonly logger = new AppLogger(TenantProvisionedBillingHandler.name);

  constructor(
    private readonly createTrialSubscription: CreateTrialSubscriptionUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<TenantProvisioned>(
      TenantProvisioned.name,
      (event) => this.handle(event),
      CreateTrialSubscriptionUseCase.CONSUMER_NAME,
      { skipWhenSuspended: false },
    );
  }

  async handle(event: TenantProvisioned): Promise<void> {
    this.logger.log('TenantProvisioned received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
    });
    try {
      await this.createTrialSubscription.execute({
        tenantId: event.tenantId,
        slug: event.data.slug,
        countryCode: event.data.countryCode,
        timezone: event.data.timezone,
        adminEmail: event.data.adminEmail,
        occurredAt: event.occurredAt,
        registrationId: event.data.registrationId,
        eventId: event.eventId,
        correlationId: event.correlationId,
      });
    } catch (err) {
      this.logger.error(
        'TenantProvisionedBillingHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}
