import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { ResourceDeactivationImpactRaised } from '../../../booking/domain/events/resource-deactivation-impact-raised.event';
import { SendResourceDeactivationImpactNotificationUseCase } from '../../application/use-cases/send-resource-deactivation-impact-notification/send-resource-deactivation-impact-notification.use-case';

@Injectable()
export class ResourceDeactivationImpactHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'notification';

  private readonly logger = new AppLogger(ResourceDeactivationImpactHandler.name);

  constructor(
    private readonly sendResourceDeactivationImpactNotification: SendResourceDeactivationImpactNotificationUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<ResourceDeactivationImpactRaised>(
      ResourceDeactivationImpactRaised.name,
      (event) => this.handle(event),
      ResourceDeactivationImpactHandler.CONSUMER_NAME,
    );
  }

  async handle(event: ResourceDeactivationImpactRaised): Promise<void> {
    this.logger.log('ResourceDeactivationImpactRaised received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      resourceId: event.data.resourceId,
    });
    try {
      await this.sendResourceDeactivationImpactNotification.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        resourceName: event.data.resourceName,
        affectedCount: event.data.affectedCount,
      });
    } catch (err) {
      this.logger.error(
        'ResourceDeactivationImpactHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}
