import { escapeHtml } from '../../../../shared/utils/escape-html';
import { NotificationTemplateKey } from '../../domain/notification-template-key.enum';
import { IInboxRepository } from '../../../../shared/ports/inbox.port';
import { ITransactionManager } from '../../../../shared/ports/transaction-manager.port';
import { SendBookingReminderDueNotificationDto } from '../dtos/send-booking-reminder-due-notification.dto';
import { INotificationDispatcher } from '../ports/notification-dispatcher.port';
import { INotificationLogRepository } from '../ports/notification-log-repository.port';
import { INotificationPlatformPort } from '../ports/notification-platform.port';
import { INotificationTemplateRepository } from '../ports/notification-template-repository.port';
import { ILocalizationPort } from '../ports/localization.port';
import {
  DEFAULT_DATE_FORMAT,
  DEFAULT_LOCALE,
  DEFAULT_TIME_FORMAT,
} from '../../domain/notification-locale.constants';
import { TemplateVariables } from '../../domain/notification-template-key.mapping';
import { formatEmailInstant } from './notification-email-format.helpers';
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
    const { date, time } = formatEmailInstant(input.scheduledAt, timezone, {
      dateFormat: tenantInfo?.dateFormat ?? DEFAULT_DATE_FORMAT,
      timeFormat: tenantInfo?.timeFormat ?? DEFAULT_TIME_FORMAT,
    });
    // One object serves both reminder templates; the day-of one simply ignores localDate.
    const variables: TemplateVariables<
      | typeof NotificationTemplateKey.BOOKING_REMINDER_DUE
      | typeof NotificationTemplateKey.BOOKING_REMINDER_DUE_TODAY
    > = {
      contactName: escapeHtml(input.customerName),
      localDate: date,
      localTime: time,
      serviceNames: input.lines.map((l) => escapeHtml(l.serviceName)).join(', '),
    };

    const emailSent = await this.dispatchTemplates(
      templates,
      input,
      input.recipientEmail,
      variables,
    );
    return { emailSent };
  }
}
