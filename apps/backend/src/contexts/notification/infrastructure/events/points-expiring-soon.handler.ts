import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { PointsExpiringSoon } from '../../../loyalty/domain/events/points-expiring-soon.event';
import { SendPointsExpiringSoonNotificationUseCase } from '../../application/use-cases/send-points-expiring-soon-notification/send-points-expiring-soon-notification.use-case';

@Injectable()
export class PointsExpiringSoonHandler implements OnModuleInit {
  private readonly logger = new AppLogger(PointsExpiringSoonHandler.name);

  constructor(
    private readonly sendNotification: SendPointsExpiringSoonNotificationUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<PointsExpiringSoon>(
      PointsExpiringSoon.name,
      (event) => this.handle(event),
      'notification',
    );
  }

  async handle(event: PointsExpiringSoon): Promise<void> {
    this.logger.log('PointsExpiringSoon received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      customerId: event.data.customerId,
      pointsExpiringSoon: event.data.pointsExpiringSoon,
    });
    try {
      await this.sendNotification.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        customerId: event.data.customerId,
        pointsExpiringSoon: event.data.pointsExpiringSoon,
        earliestExpiresAt: event.data.earliestExpiresAt,
      });
    } catch (err) {
      this.logger.error(
        'PointsExpiringSoonHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}
