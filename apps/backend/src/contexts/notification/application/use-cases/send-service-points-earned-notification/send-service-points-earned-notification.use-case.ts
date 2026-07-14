import { Inject, Injectable } from '@nestjs/common';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
import { SendServicePointsEarnedNotificationDto } from '../../dtos/send-service-points-earned-notification.dto';
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
import { IInboxRepository, INBOX_REPOSITORY } from '../../../../../shared/ports/inbox.port';
import {
  INotificationBookingPort,
  NOTIFICATION_BOOKING_PORT,
} from '../../ports/notification-booking.port';
import {
  INotificationTemplateRepository,
  NOTIFICATION_TEMPLATE_REPOSITORY,
} from '../../ports/notification-template-repository.port';
import {
  INotificationPlatformPort,
  NOTIFICATION_PLATFORM_PORT,
} from '../../ports/notification-platform.port';
import { ILocalizationPort, LOCALIZATION_PORT } from '../../ports/localization.port';
import { DEFAULT_LOCALE } from '../../../domain/notification-locale.constants';
import { BaseNotificationUseCase } from '../base-notification.use-case';

const TRIGGER = NotificationTemplateKey.SERVICE_POINTS_EARNED;

export type SendServicePointsEarnedNotificationUseCaseInput =
  SendServicePointsEarnedNotificationDto;

export interface SendServicePointsEarnedNotificationUseCaseResult {
  emailSent: boolean;
}

@Injectable()
export class SendServicePointsEarnedNotificationUseCase extends BaseNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_LOG_REPOSITORY) logRepo: INotificationLogRepository,
    @Inject(INBOX_REPOSITORY) inboxRepo: IInboxRepository,
    @Inject(NOTIFICATION_DISPATCHER) dispatcher: INotificationDispatcher,
    @Inject(NOTIFICATION_CUSTOMER_PORT) private readonly customerPort: INotificationCustomerPort,
    @Inject(NOTIFICATION_BOOKING_PORT) private readonly servicePort: INotificationBookingPort,
    @Inject(TRANSACTION_MANAGER) txManager: ITransactionManager,
    @Inject(NOTIFICATION_TEMPLATE_REPOSITORY)
    private readonly templateRepo: INotificationTemplateRepository,
    @Inject(NOTIFICATION_PLATFORM_PORT) private readonly tenantPort: INotificationPlatformPort,
    @Inject(LOCALIZATION_PORT) private readonly localizationPort: ILocalizationPort,
  ) {
    super(logRepo, inboxRepo, dispatcher, txManager);
  }

  async execute(
    input: SendServicePointsEarnedNotificationUseCaseInput,
  ): Promise<SendServicePointsEarnedNotificationUseCaseResult> {
    const templates = await this.templateRepo.findAllByTriggerEvent(input.tenantId, TRIGGER);
    if (templates.length === 0) {
      this.logger.warn('No template found — skipping', {
        tenantId: input.tenantId,
        triggerEvent: TRIGGER,
      });
      return { emailSent: false };
    }

    const customer = await this.customerPort.getCustomerInfo(input.customerId, input.tenantId);
    if (!customer) return { emailSent: false };

    const tenantInfo = await this.tenantPort.getTenantInfo(input.tenantId);
    const locale = tenantInfo?.locale ?? DEFAULT_LOCALE;
    this.localizeTemplates(templates, this.localizationPort, locale);

    const serviceIds = input.lines.map((l) => l.serviceId);
    const serviceInfos = await this.servicePort.findServicesByIds(input.tenantId, serviceIds);
    const nameById = new Map(serviceInfos.map((s) => [s.serviceId, s.serviceName]));
    const serviceNames = input.lines
      .map((l) => nameById.get(l.serviceId) ?? l.serviceId)
      .join(', ');

    const emailSent = await this.dispatchTemplates(templates, input, customer.email, {
      customerName: customer.name,
      totalPointsEarned: String(input.totalPointsEarned),
      serviceNames,
      currentBalance: String(input.currentBalance),
    });
    return { emailSent };
  }
}
