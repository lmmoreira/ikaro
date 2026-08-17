import { Inject, Injectable } from '@nestjs/common';
import { formatMoney } from '../../../../../shared/utils/money-format';
import { utcDateToLocalDate, utcDateToLocalHHMM } from '../../../../../shared/utils/calendar-date';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
import { SendBookingRescheduledNotificationDto } from '../../dtos/send-booking-rescheduled-notification.dto';
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
import { DEFAULT_LOCALE } from '../../../domain/notification-locale.constants';
import { BaseNotificationUseCase } from '../base-notification.use-case';

export type SendBookingRescheduledNotificationUseCaseInput = SendBookingRescheduledNotificationDto;

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

    const variables = this.buildVariables(input, ctx);

    const customerEmailSent = await this.dispatchTemplates(
      customerTemplates,
      input,
      input.contactEmail,
      variables,
    );

    const managerEmails = await this.staffPort.getManagerEmails(input.tenantId);
    const adminEmailSent =
      managerEmails.length > 0
        ? await this.dispatchTemplatesToMany(adminTemplates, input, managerEmails, variables)
        : false;

    return { customerEmailSent, adminEmailSent };
  }

  private async resolveDisplayContext(input: SendBookingRescheduledNotificationUseCaseInput) {
    const tenantInfo = await this.tenantPort.getTenantInfo(input.tenantId);
    const timezone = tenantInfo?.timezone ?? 'UTC';
    const locale = tenantInfo?.locale ?? DEFAULT_LOCALE;
    const previousStart = new Date(input.previousSlot.startTime);
    const newStart = new Date(input.newSlot.startTime);
    return {
      locale,
      previousLocalDate: utcDateToLocalDate(previousStart, timezone),
      previousLocalTime: utcDateToLocalHHMM(previousStart, timezone),
      newLocalDate: utcDateToLocalDate(newStart, timezone),
      newLocalTime: utcDateToLocalHHMM(newStart, timezone),
      serviceNames: input.lineSummary.map((l) => l.serviceNameAtBooking).join(', '),
      formattedTotal: formatMoney(input.totalPrice.amount, locale, input.totalPrice.currency),
    };
  }

  private loadTemplates(tenantId: string) {
    return Promise.all([
      this.templateRepo.findAllByTriggerEvent(
        tenantId,
        NotificationTemplateKey.BOOKING_RESCHEDULED_CUSTOMER,
      ),
      this.templateRepo.findAllByTriggerEvent(
        tenantId,
        NotificationTemplateKey.BOOKING_RESCHEDULED_ADMIN,
      ),
    ]);
  }

  private buildVariables(
    input: SendBookingRescheduledNotificationUseCaseInput,
    ctx: Awaited<ReturnType<typeof this.resolveDisplayContext>>,
  ): Record<string, string> {
    return {
      contactName: input.contactName,
      serviceNames: ctx.serviceNames,
      totalPrice: ctx.formattedTotal,
      previousLocalDate: ctx.previousLocalDate,
      previousLocalTime: ctx.previousLocalTime,
      newLocalDate: ctx.newLocalDate,
      newLocalTime: ctx.newLocalTime,
    };
  }
}
