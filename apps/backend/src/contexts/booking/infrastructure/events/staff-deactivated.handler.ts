import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { StaffDeactivated } from '../../../staff/domain/events/staff-deactivated.event';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { CascadeStaffDeactivationUseCase } from '../../application/use-cases/cascade-staff-deactivation.use-case';

// First real consumer of StaffDeactivated (UC-048) — no existing subscription to build on.
@Injectable()
export class StaffDeactivatedHandler implements OnModuleInit {
  private readonly logger = new AppLogger(StaffDeactivatedHandler.name);

  constructor(
    private readonly cascadeStaffDeactivation: CascadeStaffDeactivationUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<StaffDeactivated>(
      StaffDeactivated.name,
      (event) => this.handle(event),
      CascadeStaffDeactivationUseCase.CONSUMER_NAME,
    );
  }

  async handle(event: StaffDeactivated): Promise<void> {
    try {
      await this.cascadeStaffDeactivation.execute({
        tenantId: event.tenantId,
        staffId: event.data.staffId,
        eventId: event.eventId,
        correlationId: event.correlationId,
      });
    } catch (err) {
      this.logger.error(
        'StaffDeactivatedHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId, eventId: event.eventId },
      );
      throw err;
    }
  }
}
