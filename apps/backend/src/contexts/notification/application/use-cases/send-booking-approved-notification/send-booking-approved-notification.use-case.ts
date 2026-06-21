import { Inject, Injectable } from '@nestjs/common';
import { formatMoney } from '../../../../../shared/utils/money-format';
import { utcDateToLocalDate, utcDateToLocalHHMM } from '../../../../../shared/utils/calendar-date';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
import { SendBookingApprovedNotificationDto } from '../../dtos/send-booking-approved-notification.dto';
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
  INotificationPlatformPort,
  NOTIFICATION_PLATFORM_PORT,
} from '../../ports/notification-platform.port';
import {
  INotificationTemplateRepository,
  NOTIFICATION_TEMPLATE_REPOSITORY,
} from '../../ports/notification-template-repository.port';
import { ILocalizationPort, LOCALIZATION_PORT } from '../../ports/localization.port';
import { BaseNotificationUseCase } from '../base-notification.use-case';

const TRIGGER = NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER;

export interface SendBookingApprovedNotificationUseCaseResult {
  emailSent: boolean;
}

@Injectable()
export class SendBookingApprovedNotificationUseCase extends BaseNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_LOG_REPOSITORY) logRepo: INotificationLogRepository,
    @Inject(NOTIFICATION_PROCESSED_EVENT_REPOSITORY)
    processedEventRepo: INotificationProcessedEventRepository,
    @Inject(NOTIFICATION_DISPATCHER) dispatcher: INotificationDispatcher,
    @Inject(NOTIFICATION_PLATFORM_PORT) private readonly tenantPort: INotificationPlatformPort,
    @Inject(TRANSACTION_MANAGER) txManager: ITransactionManager,
    @Inject(NOTIFICATION_TEMPLATE_REPOSITORY)
    private readonly templateRepo: INotificationTemplateRepository,
    @Inject(LOCALIZATION_PORT) private readonly localizationPort: ILocalizationPort,
  ) {
    super(logRepo, processedEventRepo, dispatcher, txManager);
  }

  async execute(
    dto: SendBookingApprovedNotificationDto,
  ): Promise<SendBookingApprovedNotificationUseCaseResult> {
    const templates = await this.templateRepo.findAllByTriggerEvent(dto.tenantId, TRIGGER);
    if (templates.length === 0) {
      this.logger.warn('No template found — skipping', {
        tenantId: dto.tenantId,
        triggerEvent: TRIGGER,
      });
      return { emailSent: false };
    }

    const tenantInfo = await this.tenantPort.getTenantInfo(dto.tenantId);
    const timezone = tenantInfo?.timezone ?? 'UTC';
    const locale = tenantInfo?.locale ?? 'pt-BR';
    this.localizeTemplates(templates, this.localizationPort, locale);
    const startDate = new Date(dto.approvedSlot.startTime);
    const localDate = utcDateToLocalDate(startDate, timezone);
    const localTime = utcDateToLocalHHMM(startDate, timezone);
    const serviceNames = dto.lineSummary.map((l) => l.serviceNameAtBooking).join(', ');
    const formattedTotal = formatMoney(dto.totalPrice.amount, locale, dto.totalPrice.currency);
    const lineItems = dto.lineSummary
      .map(
        (l) =>
          `${l.serviceNameAtBooking}: ${formatMoney(l.priceAtBooking.amount, locale, l.priceAtBooking.currency)}`,
      )
      .join(', ');

    const emailSent = await this.dispatchTemplates(templates, dto, dto.contactEmail, {
      contactName: dto.contactName,
      localDate,
      localTime,
      serviceNames,
      lineItems,
      totalPrice: formattedTotal,
    });
    return { emailSent };
  }
}
