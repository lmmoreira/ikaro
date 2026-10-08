import { Inject, Injectable } from '@nestjs/common';
import { formatMoney } from '../../../../../shared/utils/money-format';
import { escapeHtml } from '../../../../../shared/utils/escape-html';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
import { SendBookingRescheduledNotificationDto } from '../../dtos/send-booking-rescheduled-notification.dto';
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
  INotificationStaffPort,
  NOTIFICATION_STAFF_PORT,
} from '../../ports/notification-staff.port';
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
import { formatEmailInstant, sentence } from '../notification-email-format.helpers';
import { BaseNotificationUseCase } from '../base-notification.use-case';

const CUSTOMER_TRIGGER = NotificationTemplateKey.BOOKING_RESCHEDULED_CUSTOMER;
const ADMIN_TRIGGER = NotificationTemplateKey.BOOKING_RESCHEDULED_ADMIN;
const LINES_KEY = 'managerEmailLines';

export interface SendBookingRescheduledNotificationUseCaseInput extends BaseContactNotificationDto {
  newSlot: SendBookingRescheduledNotificationDto['newSlot'];
  previousSlot: SendBookingRescheduledNotificationDto['previousSlot'];
  rescheduledBy: SendBookingRescheduledNotificationDto['rescheduledBy'];
  isBusiness: SendBookingRescheduledNotificationDto['isBusiness'];
  adminNotes: SendBookingRescheduledNotificationDto['adminNotes'];
  lineSummary: SendBookingRescheduledNotificationDto['lineSummary'];
  totalPrice: SendBookingRescheduledNotificationDto['totalPrice'];
}

export interface SendBookingRescheduledNotificationUseCaseResult {
  customerEmailSent: boolean;
  adminEmailSent: boolean;
}

@Injectable()
export class SendBookingRescheduledNotificationUseCase extends BaseNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_LOG_REPOSITORY) logRepo: INotificationLogRepository,
    @Inject(INBOX_REPOSITORY) inboxRepo: IInboxRepository,
    @Inject(NOTIFICATION_DISPATCHER) dispatcher: INotificationDispatcher,
    @Inject(NOTIFICATION_STAFF_PORT) private readonly staffPort: INotificationStaffPort,
    @Inject(NOTIFICATION_PLATFORM_PORT) private readonly tenantPort: INotificationPlatformPort,
    @Inject(TRANSACTION_MANAGER) txManager: ITransactionManager,
    @Inject(NOTIFICATION_TEMPLATE_REPOSITORY)
    private readonly templateRepo: INotificationTemplateRepository,
    @Inject(LOCALIZATION_PORT) private readonly localizationPort: ILocalizationPort,
  ) {
    super(logRepo, inboxRepo, dispatcher, txManager);
  }

  async execute(
    input: SendBookingRescheduledNotificationUseCaseInput,
  ): Promise<SendBookingRescheduledNotificationUseCaseResult> {
    const ctx = await this.resolveDisplayContext(input);
    const [customerTemplates, adminTemplates] = await this.loadTemplates(input.tenantId);
    this.localizeTemplates(customerTemplates, this.localizationPort, ctx.locale);
    this.localizeTemplates(adminTemplates, this.localizationPort, ctx.locale);

    const shared = this.buildVariables(input, ctx);

    const customerEmailSent = await this.dispatchTemplates(
      customerTemplates,
      input,
      input.contactEmail,
      shared satisfies TemplateVariables<typeof CUSTOMER_TRIGGER>,
    );

    const adminVariables: TemplateVariables<typeof ADMIN_TRIGGER> = {
      ...shared,
      rescheduledByLine: sentence(
        (input.isBusiness ? ctx.lines.rescheduledByBusiness : ctx.lines.rescheduledByCustomer) ??
          '',
      ),
    };
    const managerEmails = await this.staffPort.getManagerEmails(input.tenantId);
    const adminEmailSent =
      managerEmails.length > 0
        ? await this.dispatchTemplatesToMany(adminTemplates, input, managerEmails, adminVariables)
        : false;

    return { customerEmailSent, adminEmailSent };
  }

  private async resolveDisplayContext(input: SendBookingRescheduledNotificationUseCaseInput) {
    const tenantInfo = await this.tenantPort.getTenantInfo(input.tenantId);
    const timezone = tenantInfo?.timezone ?? 'UTC';
    const locale = tenantInfo?.locale ?? DEFAULT_LOCALE;
    const formats = {
      dateFormat: tenantInfo?.dateFormat ?? DEFAULT_DATE_FORMAT,
      timeFormat: tenantInfo?.timeFormat ?? DEFAULT_TIME_FORMAT,
    };
    const previous = formatEmailInstant(input.previousSlot.startTime, timezone, formats);
    const next = formatEmailInstant(input.newSlot.startTime, timezone, formats);
    return {
      locale,
      previousLocalDate: previous.date,
      previousLocalTime: previous.time,
      newLocalDate: next.date,
      newLocalTime: next.time,
      serviceNames: input.lineSummary.map((l) => escapeHtml(l.serviceNameAtBooking)).join(', '),
      formattedTotal: formatMoney(input.totalPrice.amount, locale, input.totalPrice.currency),
      lines: this.localizationPort.getEmailTableHeaders(LINES_KEY, locale),
    };
  }

  private loadTemplates(tenantId: string) {
    return Promise.all([
      this.templateRepo.findAllByTriggerEvent(tenantId, CUSTOMER_TRIGGER),
      this.templateRepo.findAllByTriggerEvent(tenantId, ADMIN_TRIGGER),
    ]);
  }

  private buildVariables(
    input: SendBookingRescheduledNotificationUseCaseInput,
    ctx: Awaited<ReturnType<typeof this.resolveDisplayContext>>,
  ): TemplateVariables<typeof CUSTOMER_TRIGGER> {
    return {
      contactName: escapeHtml(input.contactName),
      serviceNames: ctx.serviceNames,
      totalPrice: ctx.formattedTotal,
      previousLocalDate: ctx.previousLocalDate,
      previousLocalTime: ctx.previousLocalTime,
      newLocalDate: ctx.newLocalDate,
      newLocalTime: ctx.newLocalTime,
    };
  }
}
