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
import {
  INotificationProcessedEventRepository,
  NOTIFICATION_PROCESSED_EVENT_REPOSITORY,
} from '../../ports/processed-event-repository.port';
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
    @Inject(NOTIFICATION_PROCESSED_EVENT_REPOSITORY)
    processedEventRepo: INotificationProcessedEventRepository,
    @Inject(NOTIFICATION_DISPATCHER) dispatcher: INotificationDispatcher,
    @Inject(NOTIFICATION_STAFF_PORT) private readonly staffPort: INotificationStaffPort,
    @Inject(NOTIFICATION_PLATFORM_PORT) private readonly tenantPort: INotificationPlatformPort,
    @Inject(TRANSACTION_MANAGER) txManager: ITransactionManager,
    @Inject(NOTIFICATION_TEMPLATE_REPOSITORY)
    private readonly templateRepo: INotificationTemplateRepository,
    @Inject(LOCALIZATION_PORT) private readonly localizationPort: ILocalizationPort,
  ) {
    super(logRepo, processedEventRepo, dispatcher, txManager);
  }

  async execute(
    input: SendBookingRescheduledNotificationUseCaseInput,
  ): Promise<SendBookingRescheduledNotificationUseCaseResult> {
    const tenantInfo = await this.tenantPort.getTenantInfo(input.tenantId);
    const timezone = tenantInfo?.timezone ?? 'UTC';
    const locale = tenantInfo?.locale ?? DEFAULT_LOCALE;
    const previousStart = new Date(input.previousSlot.startTime);
    const newStart = new Date(input.newSlot.startTime);
    const previousLocalDate = utcDateToLocalDate(previousStart, timezone);
    const previousLocalTime = utcDateToLocalHHMM(previousStart, timezone);
    const newLocalDate = utcDateToLocalDate(newStart, timezone);
    const newLocalTime = utcDateToLocalHHMM(newStart, timezone);
    const serviceNames = input.lineSummary.map((l) => l.serviceNameAtBooking).join(', ');
    const formattedTotal = formatMoney(input.totalPrice.amount, locale, input.totalPrice.currency);

    const [customerTemplates, adminTemplates] = await Promise.all([
      this.templateRepo.findAllByTriggerEvent(
        input.tenantId,
        NotificationTemplateKey.BOOKING_RESCHEDULED_CUSTOMER,
      ),
      this.templateRepo.findAllByTriggerEvent(
        input.tenantId,
        NotificationTemplateKey.BOOKING_RESCHEDULED_ADMIN,
      ),
    ]);
    this.localizeTemplates(customerTemplates, this.localizationPort, locale);
    this.localizeTemplates(adminTemplates, this.localizationPort, locale);

    const variables: Record<string, string> = {
      contactName: input.contactName,
      serviceNames,
      totalPrice: formattedTotal,
      previousLocalDate,
      previousLocalTime,
      newLocalDate,
      newLocalTime,
    };

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
}
