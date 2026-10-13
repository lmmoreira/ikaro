import { Inject, Injectable } from '@nestjs/common';
import { escapeHtml } from '../../../../../shared/utils/escape-html';
import { IInboxRepository, INBOX_REPOSITORY } from '../../../../../shared/ports/inbox.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
import {
  DEFAULT_DATE_FORMAT,
  DEFAULT_LOCALE,
  DEFAULT_TIME_FORMAT,
} from '../../../domain/notification-locale.constants';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { TemplateVariables } from '../../../domain/notification-template-key.mapping';
import { BaseContactNotificationDto } from '../../dtos/base-contact-notification.dto';
import { ILocalizationPort, LOCALIZATION_PORT } from '../../ports/localization.port';
import {
  INotificationDispatcher,
  NOTIFICATION_DISPATCHER,
} from '../../ports/notification-dispatcher.port';
import {
  INotificationLogRepository,
  NOTIFICATION_LOG_REPOSITORY,
} from '../../ports/notification-log-repository.port';
import {
  INotificationPlatformPort,
  NOTIFICATION_PLATFORM_PORT,
  NotificationTenantInfo,
} from '../../ports/notification-platform.port';
import {
  INotificationTemplateRepository,
  NOTIFICATION_TEMPLATE_REPOSITORY,
} from '../../ports/notification-template-repository.port';
import { formatEmailInstant, labelledLine } from '../notification-email-format.helpers';
import { BaseNotificationUseCase } from '../base-notification.use-case';

const TRIGGER = NotificationTemplateKey.BOOKING_RESOURCE_REASSIGNED_CUSTOMER;
const LINES_KEY = 'managerEmailLines';

// Deliberately has no `reason`: the manager's note is internal and never reaches the customer
// (same rule as M23-S25's no-show email), so the use case cannot render it even by mistake.
export interface SendBookingResourceReassignedNotificationUseCaseInput extends BaseContactNotificationDto {
  slot: { startTime: string; endTime: string };
  lineSummary: Array<{ serviceNameAtBooking: string }>;
  // Null when the booking's requirement does not disclose the resource to the customer.
  newResourceName: string | null;
}

export interface SendBookingResourceReassignedNotificationUseCaseResult {
  customerEmailSent: boolean;
}

// M23-S23 — tells the customer a manager moved their booking to another resource at the same
// time. One email per moved booking, in the tenant's language.
@Injectable()
export class SendBookingResourceReassignedNotificationUseCase extends BaseNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_LOG_REPOSITORY) logRepo: INotificationLogRepository,
    @Inject(INBOX_REPOSITORY) inboxRepo: IInboxRepository,
    @Inject(NOTIFICATION_DISPATCHER) dispatcher: INotificationDispatcher,
    @Inject(NOTIFICATION_PLATFORM_PORT) private readonly tenantPort: INotificationPlatformPort,
    @Inject(TRANSACTION_MANAGER) txManager: ITransactionManager,
    @Inject(NOTIFICATION_TEMPLATE_REPOSITORY)
    private readonly templateRepo: INotificationTemplateRepository,
    @Inject(LOCALIZATION_PORT) private readonly localizationPort: ILocalizationPort,
  ) {
    super(logRepo, inboxRepo, dispatcher, txManager);
  }

  async execute(
    input: SendBookingResourceReassignedNotificationUseCaseInput,
  ): Promise<SendBookingResourceReassignedNotificationUseCaseResult> {
    const templates = await this.templateRepo.findAllByTriggerEvent(input.tenantId, TRIGGER);
    if (templates.length === 0) {
      this.logger.warn('No template found — skipping', {
        tenantId: input.tenantId,
        triggerEvent: TRIGGER,
      });
      return { customerEmailSent: false };
    }

    const tenantInfo = await this.tenantPort.getTenantInfo(input.tenantId);
    const locale = tenantInfo?.locale ?? DEFAULT_LOCALE;
    this.localizeTemplates(templates, this.localizationPort, locale);

    const customerEmailSent = await this.dispatchTemplates(
      templates,
      input,
      input.contactEmail,
      this.buildVariables(input, tenantInfo, locale),
    );
    return { customerEmailSent };
  }

  private buildVariables(
    input: SendBookingResourceReassignedNotificationUseCaseInput,
    tenantInfo: NotificationTenantInfo | null,
    locale: string,
  ): TemplateVariables<typeof TRIGGER> {
    const { date, time } = formatEmailInstant(input.slot.startTime, tenantInfo?.timezone ?? 'UTC', {
      dateFormat: tenantInfo?.dateFormat ?? DEFAULT_DATE_FORMAT,
      timeFormat: tenantInfo?.timeFormat ?? DEFAULT_TIME_FORMAT,
    });
    const lines = this.localizationPort.getEmailTableHeaders(LINES_KEY, locale);
    return {
      contactName: escapeHtml(input.contactName),
      serviceNames: input.lineSummary.map((l) => escapeHtml(l.serviceNameAtBooking)).join(', '),
      localDate: date,
      localTime: time,
      // '' when the requirement does not disclose the resource: the template then says only that
      // another resource now serves the booking.
      newResourceLine: labelledLine(lines.newResourceLabel ?? '', input.newResourceName),
      tenantName: escapeHtml(tenantInfo?.name ?? ''),
    };
  }
}
