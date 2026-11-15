import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { SubscriptionReactivated } from '../../../billing/domain/events/subscription-reactivated.event';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { RevalidateTenantHotsiteUseCase } from '../../application/use-cases/revalidate-tenant-hotsite.use-case';

// Platform reacts to a reactivation by refreshing the tenant's public pages (UC-122). It declares
// `skipWhenSuspended: false`: the tenant may still read as suspended while the event is delivered.
@Injectable()
export class SubscriptionReactivatedHotsiteRevalidationHandler implements OnModuleInit {
  constructor(
    private readonly revalidateTenantHotsite: RevalidateTenantHotsiteUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<SubscriptionReactivated>(
      SubscriptionReactivated.name,
      (event) => this.handle(event),
      RevalidateTenantHotsiteUseCase.CONSUMER_NAME_ON_REACTIVATION,
      { skipWhenSuspended: false },
    );
  }

  async handle(event: SubscriptionReactivated): Promise<void> {
    await this.revalidateTenantHotsite.execute({
      tenantId: event.tenantId,
      correlationId: event.correlationId,
    });
  }
}
