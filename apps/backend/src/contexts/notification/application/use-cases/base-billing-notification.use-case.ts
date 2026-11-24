import { Inject } from '@nestjs/common';
import { escapeHtml } from '../../../../shared/utils/escape-html';
import {
  APPLICATION_CONFIG,
  IApplicationConfig,
} from '../../../../shared/ports/application-config.port';
import { IInboxRepository, INBOX_REPOSITORY } from '../../../../shared/ports/inbox.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { PlatformTemplateNotFoundError } from '../../domain/errors/platform-template-not-found.error';
import { NotificationTemplate } from '../../domain/notification-template.aggregate';
import { NotificationTemplateKey } from '../../domain/notification-template-key.enum';
import { TemplateVariables } from '../../domain/notification-template-key.mapping';
import { BaseNotificationDto } from '../dtos/base-notification.dto';
import { ILocalizationPort, LOCALIZATION_PORT } from '../ports/localization.port';
import {
  INotificationDispatcher,
  NOTIFICATION_DISPATCHER,
} from '../ports/notification-dispatcher.port';
import {
  INotificationLogRepository,
  NOTIFICATION_LOG_REPOSITORY,
} from '../ports/notification-log-repository.port';
import {
  INotificationPlatformPort,
  NOTIFICATION_PLATFORM_PORT,
} from '../ports/notification-platform.port';
import { INotificationStaffPort, NOTIFICATION_STAFF_PORT } from '../ports/notification-staff.port';
import {
  INotificationTemplateRepository,
  NOTIFICATION_TEMPLATE_REPOSITORY,
} from '../ports/notification-template-repository.port';
import { BaseNotificationUseCase } from './base-notification.use-case';
import {
  formatEmailDate,
  formatEmailInstant,
  formatEmailMinorMoney,
} from './notification-email-format.helpers';

// What a Billing email's variables are built from: the tenant's name, language and date style, the
// billing page link, and the formats that turn event data (minor units, calendar dates, UTC instants)
// into text. Notification reads no Billing data, so everything else comes from the event.
export interface BillingEmailContext {
  readonly tenantName: string;
  readonly locale: string;
  readonly billingUrl: string;
  readonly money: (amountMinor: number, currency: string) => string;
  /** A tenant-local calendar date, `YYYY-MM-DD`. */
  readonly calendarDate: (date: string) => string;
  /** A UTC instant, written as the tenant-local date. */
  readonly instantDate: (isoInstant: string) => string;
}

export interface BillingEmailResult {
  readonly emailSent: boolean;
}

export interface SendBillingEmailInput<K extends NotificationTemplateKey> {
  readonly key: K;
  readonly dto: BaseNotificationDto;
  /** The event's billing email; `null` falls back to the tenant's managers. */
  readonly recipientEmail: string | null;
  readonly buildVariables: (context: BillingEmailContext) => TemplateVariables<K>;
}

// A field the email cannot be written without. A blank email is worse than a retry, so a missing
// one throws and the message ends in the dead-letter topic where S36's alert sees it.
export function requireBillingField<T>(value: T | null | undefined, field: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Billing email event is missing "${field}"`);
  }
  return value;
}

// UC-124: Ikaro sends every Billing email itself, as the platform, to the billing email or else the
// managers. The nine send use cases only choose the template key and build the variables; this base
// owns recipients, tenant info, the platform template lookup and the billing_template_missing alert.
export abstract class BaseBillingNotificationUseCase extends BaseNotificationUseCase {
  // The nine send use cases declare no constructor of their own: Nest reads the tokens from here.
  constructor(
    @Inject(NOTIFICATION_LOG_REPOSITORY) logRepo: INotificationLogRepository,
    @Inject(INBOX_REPOSITORY) inboxRepo: IInboxRepository,
    @Inject(NOTIFICATION_DISPATCHER) dispatcher: INotificationDispatcher,
    @Inject(TRANSACTION_MANAGER) txManager: ITransactionManager,
    @Inject(NOTIFICATION_STAFF_PORT) private readonly staffPort: INotificationStaffPort,
    @Inject(NOTIFICATION_PLATFORM_PORT) private readonly tenantPort: INotificationPlatformPort,
    @Inject(NOTIFICATION_TEMPLATE_REPOSITORY)
    private readonly templateRepo: INotificationTemplateRepository,
    @Inject(LOCALIZATION_PORT) protected readonly localizationPort: ILocalizationPort,
    @Inject(APPLICATION_CONFIG) private readonly config: IApplicationConfig,
  ) {
    super(logRepo, inboxRepo, dispatcher, txManager);
  }

  protected async sendBillingEmail<K extends NotificationTemplateKey>(
    input: SendBillingEmailInput<K>,
  ): Promise<boolean> {
    const { dto } = input;
    const tenantInfo = await this.tenantPort.getTenantInfo(dto.tenantId);
    if (!tenantInfo) throw new Error(`Tenant ${dto.tenantId} not found for a Billing email`);

    const template = await this.findPlatformTemplateOrAlert(input.key, tenantInfo.locale, dto);
    const emails = input.recipientEmail
      ? [input.recipientEmail]
      : await this.staffPort.getManagerEmails(dto.tenantId);
    if (emails.length === 0) {
      this.logger.warn('No recipient for a Billing email — skipping', {
        tenantId: dto.tenantId,
        correlationId: dto.correlationId,
        triggerEvent: input.key,
      });
      return false;
    }

    this.localizeTemplates([template], this.localizationPort, tenantInfo.locale);
    const formats = { dateFormat: tenantInfo.dateFormat, timeFormat: tenantInfo.timeFormat };
    const variables = input.buildVariables({
      tenantName: escapeHtml(tenantInfo.name),
      locale: tenantInfo.locale,
      billingUrl: escapeHtml(`${this.config.getOrThrow('FRONTEND_URL')}/dashboard/billing`),
      money: (amountMinor, currency) =>
        formatEmailMinorMoney(amountMinor, currency, tenantInfo.locale),
      calendarDate: (date) => formatEmailDate(date, tenantInfo.dateFormat),
      instantDate: (isoInstant) =>
        formatEmailInstant(isoInstant, tenantInfo.timezone, formats).date,
    });
    return this.dispatchTemplatesToMany([template], dto, emails, variables);
  }

  private async findPlatformTemplateOrAlert(
    key: NotificationTemplateKey,
    locale: string,
    dto: BaseNotificationDto,
  ): Promise<NotificationTemplate> {
    try {
      return await this.templateRepo.findPlatformTemplate(key, locale);
    } catch (err) {
      if (err instanceof PlatformTemplateNotFoundError) {
        // The fixed `event` field is what S36's log-based metric and alert read: do not rename it.
        this.logger.error('Billing platform template missing', err.stack, {
          event: 'billing_template_missing',
          tenantId: dto.tenantId,
          correlationId: dto.correlationId,
          triggerEvent: key,
          locale,
        });
      }
      throw err;
    }
  }
}
