import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { TenantProvisioned } from '../../../platform/domain/events/tenant-provisioned.event';
import { CreateTenantLocationResourceUseCase } from '../../application/use-cases/create-tenant-location-resource.use-case';

@Injectable()
export class TenantProvisionedHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'booking';

  private readonly logger = new AppLogger(TenantProvisionedHandler.name);

  constructor(
    private readonly createTenantLocationResource: CreateTenantLocationResourceUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<TenantProvisioned>(
      TenantProvisioned.name,
      (event) => this.handle(event),
      TenantProvisionedHandler.CONSUMER_NAME,
    );
  }

  async handle(event: TenantProvisioned): Promise<void> {
    this.logger.log('TenantProvisioned received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
    });
    try {
      await this.createTenantLocationResource.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
      });
    } catch (err) {
      this.logger.error(
        'TenantProvisionedHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}
