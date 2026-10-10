import { Inject, Injectable } from '@nestjs/common';
import { escapeHtml } from '../../../../../shared/utils/escape-html';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
import { BaseContactNotificationDto } from '../../dtos/base-contact-notification.dto';
import {
  INotificationDispatcher,
  NOTIFICATION_DISPATCHER,
} from '../../ports/notification-dispatcher.port';
import {
  INotificationLogRepository,
  NOTIFICATION_LOG_REPOSITORY,
} from '../../ports/notification-log-repository.port';
import { IInboxRepository, INBOX_REPOSITORY } from '../../../../../shared/ports/inbox.port';
import {
  INotificationPlatformPort,
  NOTIFICATION_PLATFORM_PORT,
} from '../../ports/notification-platform.port';
import {
  INotificationTemplateRepository,
  NOTIFICATION_TEMPLATE_REPOSITORY,
} from '../../ports/notification-template-repository.port';
import { ILocalizationPort, LOCALIZATION_PORT } from '../../ports/localization.port';
import {
  DEFAULT_DATE_FORMAT,
  DEFAULT_LOCALE,
  DEFAULT_TIME_FORMAT,
} from '../../../domain/notification-locale.constants';
import { TemplateVariables } from '../../../domain/notification-template-key.mapping';
import { formatEmailInstant } from '../notification-email-format.helpers';
import { BaseNotificationUseCase } from '../base-notification.use-case';

const TRIGGER = NotificationTemplateKey.BOOKING_NO_SHOW_CUSTOMER;

// Deliberately has no `reason`: the staff member's note is internal and never reaches the customer
// (M23-S25), so the use case cannot render it even by mistake.
export interface SendBookingNoShowNotificationUseCaseInput extends BaseContactNotificationDto {
  scheduledAt: string;
  lineSummary: Array<{ serviceNameAtBooking: string }>;
}

export interface SendBookingNoShowNotificationUseCaseResult {
  customerEmailSent: boolean;
}

@Injectable()
export class SendBookingNoShowNotificationUseCase extends BaseNotificationUseCase {
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
    input: SendBookingNoShowNotificationUseCaseInput,
  ): Promise<SendBookingNoShowNotificationUseCaseResult> {
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
    const { date, time } = formatEmailInstant(input.scheduledAt, tenantInfo?.timezone ?? 'UTC', {
      dateFormat: tenantInfo?.dateFormat ?? DEFAULT_DATE_FORMAT,
      timeFormat: tenantInfo?.timeFormat ?? DEFAULT_TIME_FORMAT,
    });
    const variables: TemplateVariables<typeof TRIGGER> = {
      contactName: escapeHtml(input.contactName),
      serviceNames: input.lineSummary.map((l) => escapeHtml(l.serviceNameAtBooking)).join(', '),
      localDate: date,
      localTime: time,
      tenantName: escapeHtml(tenantInfo?.name ?? ''),
    };

    this.localizeTemplates(templates, this.localizationPort, locale);
    const customerEmailSent = await this.dispatchTemplates(
      templates,
      input,
      input.contactEmail,
      variables,
    );
    return { customerEmailSent };
  }
}
