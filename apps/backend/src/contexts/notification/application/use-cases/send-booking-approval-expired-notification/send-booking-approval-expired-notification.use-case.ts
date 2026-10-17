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
  NotificationTenantInfo,
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

const TRIGGER = NotificationTemplateKey.BOOKING_APPROVAL_EXPIRED_CUSTOMER;

export interface SendBookingApprovalExpiredNotificationUseCaseInput extends BaseContactNotificationDto {
  scheduledAt: string;
  lineSummary: Array<{ serviceNameAtBooking: string }>;
}

export interface SendBookingApprovalExpiredNotificationUseCaseResult {
  customerEmailSent: boolean;
}

// TD51: a manual-approval request nobody decided in time was cancelled by the system. Tells the
// customer it expired unanswered, that nothing was booked and that they may ask again; it names
// no staff member, and managers get nothing (they did not act, so there is nothing to tell them).
@Injectable()
export class SendBookingApprovalExpiredNotificationUseCase extends BaseNotificationUseCase {
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
    input: SendBookingApprovalExpiredNotificationUseCaseInput,
  ): Promise<SendBookingApprovalExpiredNotificationUseCaseResult> {
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
      this.buildVariables(input, tenantInfo),
    );
    return { customerEmailSent };
  }

  private buildVariables(
    input: SendBookingApprovalExpiredNotificationUseCaseInput,
    tenantInfo: NotificationTenantInfo | null,
  ): TemplateVariables<typeof TRIGGER> {
    const { date, time } = formatEmailInstant(input.scheduledAt, tenantInfo?.timezone ?? 'UTC', {
      dateFormat: tenantInfo?.dateFormat ?? DEFAULT_DATE_FORMAT,
      timeFormat: tenantInfo?.timeFormat ?? DEFAULT_TIME_FORMAT,
    });
    return {
      contactName: escapeHtml(input.contactName),
      serviceNames: input.lineSummary.map((l) => escapeHtml(l.serviceNameAtBooking)).join(', '),
      localDate: date,
      localTime: time,
      tenantName: escapeHtml(tenantInfo?.name ?? ''),
    };
  }
}
