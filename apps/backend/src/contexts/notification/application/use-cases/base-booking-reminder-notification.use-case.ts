import { utcDateToLocalDate, utcDateToLocalHHMM } from '../../../../shared/utils/calendar-date';
import { NotificationTemplateKey } from '../../domain/notification-template-key.enum';
import { IInboxRepository } from '../../../../shared/ports/inbox.port';
import { ITransactionManager } from '../../../../shared/ports/transaction-manager.port';
import { SendBookingReminderDueNotificationDto } from '../dtos/send-booking-reminder-due-notification.dto';
import { INotificationDispatcher } from '../ports/notification-dispatcher.port';
import { INotificationLogRepository } from '../ports/notification-log-repository.port';
import { INotificationPlatformPort } from '../ports/notification-platform.port';
import { INotificationTemplateRepository } from '../ports/notification-template-repository.port';
import { ILocalizationPort } from '../ports/localization.port';
import { DEFAULT_LOCALE } from '../../domain/notification-locale.constants';
import { BaseNotificationUseCase } from './base-notification.use-case';

export type BookingReminderNotificationUseCaseInput = SendBookingReminderDueNotificationDto;

export interface BookingReminderNotificationUseCaseResult {
  emailSent: boolean;
}

export abstract class BaseBookingReminderNotificationUseCase extends BaseNotificationUseCase {
  protected abstract readonly reminderTemplateKey: NotificationTemplateKey;

  constructor(
    logRepo: INotificationLogRepository,
    inboxRepo: IInboxRepository,
    dispatcher: INotificationDispatcher,
    protected readonly tenantPort: INotificationPlatformPort,
    txManager: ITransactionManager,
    protected readonly templateRepo: INotificationTemplateRepository,
    protected readonly localizationPort: ILocalizationPort,
  ) {
    super(logRepo, inboxRepo, dispatcher, txManager);
  }

  async execute(
    input: BookingReminderNotificationUseCaseInput,
  ): Promise<BookingReminderNotificationUseCaseResult> {
    const templates = await this.templateRepo.findAllByTriggerEvent(
      input.tenantId,
      this.reminderTemplateKey,
    );
    if (templates.length === 0) {
      this.logger.warn('No template found — skipping', {
        tenantId: input.tenantId,
        triggerEvent: this.reminderTemplateKey,
      });
      return { emailSent: false };
    }

    const tenantInfo = await this.tenantPort.getTenantInfo(input.tenantId);
    const timezone = tenantInfo?.timezone ?? 'UTC';
    const locale = tenantInfo?.locale ?? DEFAULT_LOCALE;
    this.localizeTemplates(templates, this.localizationPort, locale);
    const start = new Date(input.scheduledAt);
    const localDate = utcDateToLocalDate(start, timezone);
    const localTime = utcDateToLocalHHMM(start, timezone);
    const serviceNames = input.lines.map((l) => l.serviceName).join(', ');

    const emailSent = await this.dispatchTemplates(templates, input, input.recipientEmail, {
      customerName: input.customerName,
      localDate,
      localTime,
      serviceNames,
    });
    return { emailSent };
  }
}
