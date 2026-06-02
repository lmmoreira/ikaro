import { utcDateToLocalDate, utcDateToLocalHHMM } from '../../../../shared/utils/calendar-date';
import { NotificationTemplateKey } from '../../domain/notification-template-key.enum';
import { ITransactionManager } from '../../../../shared/ports/transaction-manager.port';
import { SendBookingReminderDueNotificationDto } from '../dtos/send-booking-reminder-due-notification.dto';
import { INotificationDispatcher } from '../ports/notification-dispatcher.port';
import { INotificationLogRepository } from '../ports/notification-log-repository.port';
import { INotificationProcessedEventRepository } from '../ports/processed-event-repository.port';
import { INotificationTenantPort } from '../ports/notification-tenant.port';
import { BaseNotificationUseCase } from './base-notification.use-case';

const CHANNEL = 'EMAIL';

export interface BookingReminderNotificationUseCaseResult {
  emailSent: boolean;
}

export abstract class BaseBookingReminderNotificationUseCase extends BaseNotificationUseCase {
  protected abstract readonly reminderTemplateKey: NotificationTemplateKey;
  protected abstract readonly reminderSubject: string;

  constructor(
    logRepo: INotificationLogRepository,
    processedEventRepo: INotificationProcessedEventRepository,
    dispatcher: INotificationDispatcher,
    protected readonly tenantPort: INotificationTenantPort,
    txManager: ITransactionManager,
  ) {
    super(logRepo, processedEventRepo, dispatcher, txManager);
  }

  async execute(
    dto: SendBookingReminderDueNotificationDto,
  ): Promise<BookingReminderNotificationUseCaseResult> {
    if (await this.isAlreadySent(dto.eventId, this.reminderTemplateKey, CHANNEL)) {
      return { emailSent: false };
    }

    const tenantInfo = await this.tenantPort.getTenantInfo(dto.tenantId);
    const timezone = tenantInfo?.timezone ?? 'America/Sao_Paulo';

    const start = new Date(dto.scheduledAt);
    const localDate = utcDateToLocalDate(start, timezone);
    const localTime = utcDateToLocalHHMM(start, timezone);
    const serviceNames = dto.lines.map((l) => l.serviceName).join(', ');

    try {
      await this.dispatcher.dispatch({
        tenantId: dto.tenantId,
        to: dto.recipientEmail,
        subject: this.reminderSubject,
        templateKey: this.reminderTemplateKey,
        data: { customerName: dto.customerName, localDate, localTime, serviceNames },
      });
      await this.saveLog(
        dto.tenantId,
        dto.eventId,
        this.reminderTemplateKey,
        CHANNEL,
        dto.recipientEmail,
      );
      return { emailSent: true };
    } catch (err: unknown) {
      await this.saveFailedLog(
        dto.tenantId,
        dto.eventId,
        this.reminderTemplateKey,
        CHANNEL,
        dto.recipientEmail,
        String(err),
      );
      throw err;
    }
  }
}
