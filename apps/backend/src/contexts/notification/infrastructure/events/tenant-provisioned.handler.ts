import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { TenantProvisioned } from '../../../platform/domain/events/tenant-provisioned.event';
import { SeedDefaultTemplatesUseCase } from '../../application/use-cases/seed-default-templates/seed-default-templates.use-case';

@Injectable()
export class TenantProvisionedNotificationHandler implements OnModuleInit {
  private readonly logger = new AppLogger(TenantProvisionedNotificationHandler.name);

  constructor(
    private readonly seedDefaultTemplates: SeedDefaultTemplatesUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<TenantProvisioned>(
      TenantProvisioned.name,
      (event) => this.handle(event),
      'notification-template-seed',
    );
  }

  async handle(event: TenantProvisioned): Promise<void> {
    this.logger.log('TenantProvisioned received — seeding default templates', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
    });
    try {
      const result = await this.seedDefaultTemplates.execute({ tenantId: event.tenantId });
      this.logger.log('Default templates seeded', {
        tenantId: event.tenantId,
        seeded: result.seeded,
      });
    } catch (err) {
      this.logger.error(
        'TenantProvisionedNotificationHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}
