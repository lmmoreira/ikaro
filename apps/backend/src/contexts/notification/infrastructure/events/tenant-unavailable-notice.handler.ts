import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { redactEmailForLogging } from '../../../../shared/utils/redact-email-for-logging';
import { TenantUnavailableNoticeDue } from '../../../booking/domain/commands/tenant-unavailable-notice-due.command';
import { SendTenantUnavailableNoticeNotificationUseCase } from '../../application/use-cases/send-tenant-unavailable-notice-notification/send-tenant-unavailable-notice-notification.use-case';

// Declares skipWhenSuspended: false: the tenant is already suspended when each command arrives, so
// the delivery gate would otherwise drop every one of them and no customer would be told (UC-123).
@Injectable()
export class TenantUnavailableNoticeHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'notify-customer-tenant-unavailable';

  private readonly logger = new AppLogger(TenantUnavailableNoticeHandler.name);

  constructor(
    private readonly sendTenantUnavailableNotice: SendTenantUnavailableNoticeNotificationUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<TenantUnavailableNoticeDue>(
      TenantUnavailableNoticeDue.name,
      (event) => this.handle(event),
      TenantUnavailableNoticeHandler.CONSUMER_NAME,
      { skipWhenSuspended: false },
    );
  }

  async handle(event: TenantUnavailableNoticeDue): Promise<void> {
    this.logger.log('TenantUnavailableNoticeDue received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      eventId: event.eventId,
    });
    try {
      await this.sendTenantUnavailableNotice.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        customerId: event.data.customerId,
      });
    } catch (err) {
      this.logger.error(
        'TenantUnavailableNoticeHandler failed — will nack for retry',
        // A dispatcher error can carry the recipient's address (e.g. "550 mailbox not found: <email>").
        redactEmailForLogging(err instanceof Error ? (err.stack ?? err.message) : String(err)),
        { tenantId: event.tenantId, correlationId: event.correlationId, eventId: event.eventId },
      );
      throw err;
    }
  }
}
