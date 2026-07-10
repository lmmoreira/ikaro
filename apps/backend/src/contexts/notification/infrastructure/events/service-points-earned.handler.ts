import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { ServicePointsEarned } from '../../../loyalty/domain/events/service-points-earned.event';
import { SendServicePointsEarnedNotificationUseCase } from '../../application/use-cases/send-service-points-earned-notification/send-service-points-earned-notification.use-case';

@Injectable()
export class ServicePointsEarnedHandler implements OnModuleInit {
  private readonly logger = new AppLogger(ServicePointsEarnedHandler.name);

  constructor(
    private readonly sendServicePointsEarnedNotification: SendServicePointsEarnedNotificationUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<ServicePointsEarned>(
      ServicePointsEarned.name,
      (event) => this.handle(event),
      'notification',
    );
  }

  async handle(event: ServicePointsEarned): Promise<void> {
    this.logger.log('ServicePointsEarned received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      customerId: event.data.customerId,
      totalPointsEarned: event.data.totalPointsEarned,
      lineCount: event.data.lines.length,
    });
    try {
      await this.sendServicePointsEarnedNotification.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        customerId: event.data.customerId,
        bookingId: event.data.bookingId,
        totalPointsEarned: event.data.totalPointsEarned,
        earnedAt: event.data.earnedAt,
        lines: event.data.lines,
        currentBalance: event.data.currentBalance,
      });
    } catch (err) {
      this.logger.error(
        'ServicePointsEarnedHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}
