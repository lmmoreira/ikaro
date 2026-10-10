import { Inject, Injectable } from '@nestjs/common';
import { escapeHtml } from '../../../../../shared/utils/escape-html';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
import { BaseNotificationDto } from '../../dtos/base-notification.dto';
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

const TRIGGER = NotificationTemplateKey.BOOKING_NO_SHOW_CUSTOMER;

// Deliberately has no `reason`: the staff member's note is internal and never reaches the customer
// (M23-S25), so the use case cannot render it even by mistake. The contact snapshot is optional
// because a BookingNoShow published before M23-S25 does not carry it.
export interface SendBookingNoShowNotificationUseCaseInput extends BaseNotificationDto {
  contactEmail?: string;
  contactName?: string;
  scheduledAt?: string;
  lineSummary?: Array<{ serviceNameAtBooking: string }>;
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
    const { contactEmail, contactName, scheduledAt, lineSummary } = input;
    if (!contactEmail || contactName === undefined || !scheduledAt || !lineSummary) {
      this.logger.warn('BookingNoShow carries no contact snapshot — skipping', {
        tenantId: input.tenantId,
        correlationId: input.correlationId,
      });
      return { customerEmailSent: false };
    }

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
    const variables = this.buildVariables({ contactName, scheduledAt, lineSummary }, tenantInfo);

    this.localizeTemplates(templates, this.localizationPort, locale);
    const customerEmailSent = await this.dispatchTemplates(
      templates,
      input,
      contactEmail,
      variables,
    );
    return { customerEmailSent };
  }

  private buildVariables(
    snapshot: {
      contactName: string;
      scheduledAt: string;
      lineSummary: Array<{ serviceNameAtBooking: string }>;
    },
    tenantInfo: NotificationTenantInfo | null,
  ): TemplateVariables<typeof TRIGGER> {
    const { date, time } = formatEmailInstant(snapshot.scheduledAt, tenantInfo?.timezone ?? 'UTC', {
      dateFormat: tenantInfo?.dateFormat ?? DEFAULT_DATE_FORMAT,
      timeFormat: tenantInfo?.timeFormat ?? DEFAULT_TIME_FORMAT,
    });
    return {
      contactName: escapeHtml(snapshot.contactName),
      serviceNames: snapshot.lineSummary.map((l) => escapeHtml(l.serviceNameAtBooking)).join(', '),
      localDate: date,
      localTime: time,
      tenantName: escapeHtml(tenantInfo?.name ?? ''),
    };
  }
}
