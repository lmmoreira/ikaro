import { Inject, Injectable } from '@nestjs/common';
import { formatMoney } from '../../../../../shared/utils/money-format';
import { utcDateToLocalDate, utcDateToLocalHHMM } from '../../../../../shared/utils/calendar-date';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
import { SendBookingRequestedNotificationDto } from '../../dtos/send-booking-requested-notification.dto';
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

export type SendBookingRequestedNotificationUseCaseInput = SendBookingRequestedNotificationDto;

export interface SendBookingRequestedNotificationUseCaseResult {
  adminEmailSent: boolean;
  customerEmailSent: boolean;
}

@Injectable()
export class SendBookingRequestedNotificationUseCase extends BaseNotificationUseCase {
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
    input: SendBookingRequestedNotificationUseCaseInput,
  ): Promise<SendBookingRequestedNotificationUseCaseResult> {
    const serviceNames = input.lines.map((l) => l.serviceNameAtBooking).join(', ');

    const [adminTemplates, customerTemplates, managerEmails, tenantInfo] = await Promise.all([
      this.templateRepo.findAllByTriggerEvent(
        input.tenantId,
        NotificationTemplateKey.BOOKING_REQUESTED_ADMIN,
      ),
      this.templateRepo.findAllByTriggerEvent(
        input.tenantId,
        NotificationTemplateKey.BOOKING_REQUESTED_CUSTOMER,
      ),
      this.staffPort.getManagerEmails(input.tenantId),
      this.tenantPort.getTenantInfo(input.tenantId),
    ]);

    const timezone = tenantInfo?.timezone ?? 'UTC';
    const locale = tenantInfo?.locale ?? DEFAULT_LOCALE;
    this.localizeTemplates(adminTemplates, this.localizationPort, locale);
    this.localizeTemplates(customerTemplates, this.localizationPort, locale);
    const formattedPrice = formatMoney(input.totalPrice.amount, locale, input.totalPrice.currency);
    const scheduledDate = new Date(input.scheduledAt);
    const localDate = utcDateToLocalDate(scheduledDate, timezone);
    const localTime = utcDateToLocalHHMM(scheduledDate, timezone);
    const [year, month, day] = localDate.split('-') as [string, string, string];
    const formattedScheduledAt = `${day}/${month}/${year} às ${localTime}`;

    const variables: Record<string, string> = {
      contactName: input.contactName,
      scheduledAt: formattedScheduledAt,
      serviceNames,
      totalPrice: formattedPrice,
      pickupAddress: input.pickupAddress ? JSON.stringify(input.pickupAddress) : '',
      tenantName: tenantInfo?.name ?? '',
    };

    const adminEmailSent =
      managerEmails.length > 0
        ? await this.dispatchTemplatesToMany(adminTemplates, input, managerEmails, variables)
        : false;

    const customerEmailSent = await this.dispatchTemplates(
      customerTemplates,
      input,
      input.contactEmail,
      variables,
    );

    return { adminEmailSent, customerEmailSent };
  }
}
