import { Inject, Injectable } from '@nestjs/common';
import { IInboxRepository, INBOX_REPOSITORY } from '../../../../../shared/ports/inbox.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
import { escapeHtml } from '../../../../../shared/utils/escape-html';
import { DEFAULT_LOCALE } from '../../../domain/notification-locale.constants';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { TemplateVariables } from '../../../domain/notification-template-key.mapping';
import { SendTenantUnavailableNoticeNotificationDto } from '../../dtos/send-tenant-unavailable-notice-notification.dto';
import { ILocalizationPort, LOCALIZATION_PORT } from '../../ports/localization.port';
import {
  INotificationCustomerPort,
  NOTIFICATION_CUSTOMER_PORT,
} from '../../ports/notification-customer.port';
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
} from '../../ports/notification-platform.port';
import {
  INotificationTemplateRepository,
  NOTIFICATION_TEMPLATE_REPOSITORY,
} from '../../ports/notification-template-repository.port';
import { BaseNotificationUseCase } from '../base-notification.use-case';

const TRIGGER = NotificationTemplateKey.TENANT_UNAVAILABLE_CUSTOMER;

export interface SendTenantUnavailableNoticeNotificationUseCaseInput {
  tenantId: SendTenantUnavailableNoticeNotificationDto['tenantId'];
  eventId: SendTenantUnavailableNoticeNotificationDto['eventId'];
  correlationId: SendTenantUnavailableNoticeNotificationDto['correlationId'];
  customerId: SendTenantUnavailableNoticeNotificationDto['customerId'];
}

export interface SendTenantUnavailableNoticeNotificationUseCaseResult {
  emailSent: boolean;
}

// M25-S28 (UC-121 O-B1): one reason-neutral email to one customer, telling them the business is
// temporarily unavailable. The command carries the customer id only; the address is read here, at
// send time, so no personal data travels through the outbox or Pub/Sub. It never says why the
// tenant is unavailable and carries no link (the hotsite shows "not published" meanwhile).
@Injectable()
export class SendTenantUnavailableNoticeNotificationUseCase extends BaseNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_LOG_REPOSITORY) logRepo: INotificationLogRepository,
    @Inject(INBOX_REPOSITORY) inboxRepo: IInboxRepository,
    @Inject(NOTIFICATION_DISPATCHER) dispatcher: INotificationDispatcher,
    @Inject(NOTIFICATION_CUSTOMER_PORT) private readonly customerPort: INotificationCustomerPort,
    @Inject(TRANSACTION_MANAGER) txManager: ITransactionManager,
    @Inject(NOTIFICATION_TEMPLATE_REPOSITORY)
    private readonly templateRepo: INotificationTemplateRepository,
    @Inject(NOTIFICATION_PLATFORM_PORT) private readonly tenantPort: INotificationPlatformPort,
    @Inject(LOCALIZATION_PORT) private readonly localizationPort: ILocalizationPort,
  ) {
    super(logRepo, inboxRepo, dispatcher, txManager);
  }

  async execute(
    input: SendTenantUnavailableNoticeNotificationUseCaseInput,
  ): Promise<SendTenantUnavailableNoticeNotificationUseCaseResult> {
    const { tenantId, eventId, customerId } = input;
    const templates = await this.templateRepo.findAllByTriggerEvent(tenantId, TRIGGER);
    if (templates.length === 0) {
      this.logger.warn('No template found — skipping', { tenantId, triggerEvent: TRIGGER });
      return { emailSent: false };
    }

    const tenantInfo = await this.tenantPort.getTenantInfo(tenantId);
    if (!tenantInfo) {
      this.logger.warn('Tenant not found — skipping', { tenantId, eventId });
      return { emailSent: false };
    }
    const customer = await this.customerPort.getCustomerInfo(customerId, tenantId);
    if (!customer) {
      this.logger.warn('Customer not readable — skipping', { tenantId, eventId, customerId });
      return { emailSent: false };
    }

    this.localizeTemplates(templates, this.localizationPort, tenantInfo.locale ?? DEFAULT_LOCALE);
    const variables: TemplateVariables<typeof TRIGGER> = {
      customerName: escapeHtml(customer.name),
      tenantName: escapeHtml(tenantInfo.name),
    };
    const emailSent = await this.dispatchTemplates(templates, input, customer.email, variables);
    return { emailSent };
  }
}
