import { Inject, Injectable } from '@nestjs/common';
import { formatMoney } from '../../../../../shared/utils/money-format';
import { escapeHtml } from '../../../../../shared/utils/escape-html';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
import { SendBookingCancelledNotificationDto } from '../../dtos/send-booking-cancelled-notification.dto';
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
import { formatEmailInstant, labelledLine, sentence } from '../notification-email-format.helpers';
import { BaseNotificationUseCase } from '../base-notification.use-case';

const CUSTOMER_TRIGGER = NotificationTemplateKey.BOOKING_CANCELLED_CUSTOMER;
const ADMIN_TRIGGER = NotificationTemplateKey.BOOKING_CANCELLED_ADMIN;
const LINES_KEY = 'managerEmailLines';

interface CancelledDisplayContext {
  locale: string;
  localDate: string;
  localTime: string;
  serviceNames: string;
  formattedTotal: string;
  lines: Record<string, string>;
}

export interface SendBookingCancelledNotificationUseCaseInput extends BaseContactNotificationDto {
  cancelledBy: SendBookingCancelledNotificationDto['cancelledBy'];
  isBusiness: SendBookingCancelledNotificationDto['isBusiness'];
  reason: SendBookingCancelledNotificationDto['reason'];
  scheduledAt: SendBookingCancelledNotificationDto['scheduledAt'];
  lineSummary: SendBookingCancelledNotificationDto['lineSummary'];
  totalPrice: SendBookingCancelledNotificationDto['totalPrice'];
  cancelledByScheduleEnd: SendBookingCancelledNotificationDto['cancelledByScheduleEnd'];
}

export interface SendBookingCancelledNotificationUseCaseResult {
  customerEmailSent: boolean;
  adminEmailSent: boolean;
}

@Injectable()
export class SendBookingCancelledNotificationUseCase extends BaseNotificationUseCase {
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
    input: SendBookingCancelledNotificationUseCaseInput,
  ): Promise<SendBookingCancelledNotificationUseCaseResult> {
    // An occurrence cancelled because its recurring schedule was ended sends nothing of its own:
    // the schedule's single RecurringBookingScheduleEnded email replaces one email per occurrence
    // (M23-S28, docs/03-DOMAIN_EVENTS.md § BookingCancelled).
    if (input.cancelledByScheduleEnd) {
      this.logger.log('Skipping — occurrence cancelled by its recurring schedule ending', {
        tenantId: input.tenantId,
        correlationId: input.correlationId,
      });
      return { customerEmailSent: false, adminEmailSent: false };
    }

    const ctx = await this.resolveDisplayContext(input);
    const [customerTemplates, adminTemplates] = await this.loadTemplates(input.tenantId);
    this.localizeTemplates(customerTemplates, this.localizationPort, ctx.locale);
    this.localizeTemplates(adminTemplates, this.localizationPort, ctx.locale);

    const customerEmailSent = await this.dispatchTemplates(
      customerTemplates,
      input,
      input.contactEmail,
      this.customerVariables(input, ctx),
    );

    const managerEmails = await this.staffPort.getManagerEmails(input.tenantId);
    const adminEmailSent =
      managerEmails.length > 0
        ? await this.dispatchTemplatesToMany(
            adminTemplates,
            input,
            managerEmails,
            this.adminVariables(input, ctx),
          )
        : false;

    return { customerEmailSent, adminEmailSent };
  }

  private async resolveDisplayContext(
    input: SendBookingCancelledNotificationUseCaseInput,
  ): Promise<CancelledDisplayContext> {
    const tenantInfo = await this.tenantPort.getTenantInfo(input.tenantId);
    const locale = tenantInfo?.locale ?? DEFAULT_LOCALE;
    const { date, time } = formatEmailInstant(input.scheduledAt, tenantInfo?.timezone ?? 'UTC', {
      dateFormat: tenantInfo?.dateFormat ?? DEFAULT_DATE_FORMAT,
      timeFormat: tenantInfo?.timeFormat ?? DEFAULT_TIME_FORMAT,
    });
    return {
      locale,
      localDate: date,
      localTime: time,
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

  // The customer is told why only when the business cancelled: a reason the customer typed for
  // their own cancellation is not news to them.
  private customerVariables(
    input: SendBookingCancelledNotificationUseCaseInput,
    ctx: CancelledDisplayContext,
  ): TemplateVariables<typeof CUSTOMER_TRIGGER> {
    return {
      contactName: escapeHtml(input.contactName),
      serviceNames: ctx.serviceNames,
      totalPrice: ctx.formattedTotal,
      localDate: ctx.localDate,
      localTime: ctx.localTime,
      reasonLine: input.isBusiness ? labelledLine(ctx.lines.reasonLabel ?? '', input.reason) : '',
    };
  }

  // The manager is told who cancelled (the event carries isBusiness, not a name) and the reason.
  private adminVariables(
    input: SendBookingCancelledNotificationUseCaseInput,
    ctx: CancelledDisplayContext,
  ): TemplateVariables<typeof ADMIN_TRIGGER> {
    return {
      contactName: escapeHtml(input.contactName),
      serviceNames: ctx.serviceNames,
      totalPrice: ctx.formattedTotal,
      localDate: ctx.localDate,
      localTime: ctx.localTime,
      cancelledByLine: sentence(
        (input.isBusiness ? ctx.lines.cancelledByBusiness : ctx.lines.cancelledByCustomer) ?? '',
      ),
      reasonLine: labelledLine(ctx.lines.reasonLabel ?? '', input.reason),
    };
  }
}
