import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { SubscriptionSuspended } from '../../../billing/domain/events/subscription-suspended.event';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { RevalidateTenantHotsiteUseCase } from '../../application/use-cases/revalidate-tenant-hotsite.use-case';

// Platform reacts to a suspension by refreshing the tenant's public pages (UC-122). It declares
// `skipWhenSuspended: false`: it exists because the tenant is suspended.
@Injectable()
export class SubscriptionSuspendedHotsiteRevalidationHandler implements OnModuleInit {
  constructor(
    private readonly revalidateTenantHotsite: RevalidateTenantHotsiteUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<SubscriptionSuspended>(
      SubscriptionSuspended.name,
      (event) => this.handle(event),
      RevalidateTenantHotsiteUseCase.CONSUMER_NAME_ON_SUSPENSION,
      { skipWhenSuspended: false },
    );
  }

  async handle(event: SubscriptionSuspended): Promise<void> {
    await this.revalidateTenantHotsite.execute({
      tenantId: event.tenantId,
      correlationId: event.correlationId,
    });
  }
}
