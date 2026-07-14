import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { TenantProvisioned } from '../../../platform/domain/events/tenant-provisioned.event';
import { CreateInitialManagerUseCase } from '../../application/use-cases/create-initial-manager.use-case';

@Injectable()
export class TenantProvisionedHandler implements OnModuleInit {
  private readonly logger = new AppLogger(TenantProvisionedHandler.name);

  constructor(
    private readonly createInitialManager: CreateInitialManagerUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<TenantProvisioned>(
      TenantProvisioned.name,
      (event) => this.handle(event),
      'staff',
    );
  }

  async handle(event: TenantProvisioned): Promise<void> {
    this.logger.log('TenantProvisioned received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
    });
    try {
      await this.createInitialManager.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        adminEmail: event.data.adminEmail,
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
