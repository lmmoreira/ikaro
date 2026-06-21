import { utcDateToLocalDate, utcDateToLocalHHMM } from '../../../../shared/utils/calendar-date';
import { NotificationTemplateKey } from '../../domain/notification-template-key.enum';
import { ITransactionManager } from '../../../../shared/ports/transaction-manager.port';
import { SendBookingReminderDueNotificationDto } from '../dtos/send-booking-reminder-due-notification.dto';
import { INotificationDispatcher } from '../ports/notification-dispatcher.port';
import { INotificationLogRepository } from '../ports/notification-log-repository.port';
import { INotificationProcessedEventRepository } from '../ports/processed-event-repository.port';
import { INotificationPlatformPort } from '../ports/notification-platform.port';
import { INotificationTemplateRepository } from '../ports/notification-template-repository.port';
import { ILocalizationPort } from '../ports/localization.port';
import { BaseNotificationUseCase } from './base-notification.use-case';

export interface BookingReminderNotificationUseCaseResult {
  emailSent: boolean;
}

export abstract class BaseBookingReminderNotificationUseCase extends BaseNotificationUseCase {
  protected abstract readonly reminderTemplateKey: NotificationTemplateKey;
  protected abstract readonly eventName: string;

  constructor(
    logRepo: INotificationLogRepository,
    processedEventRepo: INotificationProcessedEventRepository,
    dispatcher: INotificationDispatcher,
    protected readonly tenantPort: INotificationPlatformPort,
    txManager: ITransactionManager,
    protected readonly templateRepo: INotificationTemplateRepository,
    protected readonly localizationPort: ILocalizationPort,
  ) {
    super(logRepo, processedEventRepo, dispatcher, txManager);
  }

  async execute(
    dto: SendBookingReminderDueNotificationDto,
  ): Promise<BookingReminderNotificationUseCaseResult> {
    const templates = await this.templateRepo.findAllByTriggerEvent(
      dto.tenantId,
      this.reminderTemplateKey,
    );
    if (templates.length === 0) {
      this.logger.warn('No template found — skipping', {
        tenantId: dto.tenantId,
        triggerEvent: this.reminderTemplateKey,
      });
      return { emailSent: false };
    }

    const tenantInfo = await this.tenantPort.getTenantInfo(dto.tenantId);
    const timezone = tenantInfo?.timezone ?? 'UTC';
    const locale = tenantInfo?.locale ?? 'pt-BR';
    this.localizeTemplates(templates, this.localizationPort, this.eventName, 'customer', locale);
    const start = new Date(dto.scheduledAt);
    const localDate = utcDateToLocalDate(start, timezone);
    const localTime = utcDateToLocalHHMM(start, timezone);
    const serviceNames = dto.lines.map((l) => l.serviceName).join(', ');

    const emailSent = await this.dispatchTemplates(templates, dto, dto.recipientEmail, {
      customerName: dto.customerName,
      localDate,
      localTime,
      serviceNames,
    });
    return { emailSent };
  }
}
