import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { StaffInvited } from '../../../staff/domain/events/staff-invited.event';
import { SendStaffInvitationUseCase } from '../../application/use-cases/send-staff-invitation/send-staff-invitation.use-case';

@Injectable()
export class StaffInvitedHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'notification';

  private readonly logger = new AppLogger(StaffInvitedHandler.name);

  constructor(
    private readonly sendStaffInvitation: SendStaffInvitationUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<StaffInvited>(
      StaffInvited.name,
      (event) => this.handle(event),
      StaffInvitedHandler.CONSUMER_NAME,
    );
  }

  async handle(event: StaffInvited): Promise<void> {
    this.logger.log('StaffInvited received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      staffId: event.data.staffId,
    });
    try {
      await this.sendStaffInvitation.execute({
        staffId: event.data.staffId,
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
      });
    } catch (err) {
      this.logger.error(
        'StaffInvitedHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}
