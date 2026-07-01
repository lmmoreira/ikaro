import { Inject, Injectable } from '@nestjs/common';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
import { SendPointsExpiringSoonNotificationDto } from '../../dtos/send-points-expiring-soon-notification.dto';
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
  INotificationProcessedEventRepository,
  NOTIFICATION_PROCESSED_EVENT_REPOSITORY,
} from '../../ports/processed-event-repository.port';
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

const TRIGGER = NotificationTemplateKey.POINTS_EXPIRING_SOON;

export type SendPointsExpiringSoonNotificationUseCaseInput = SendPointsExpiringSoonNotificationDto;

export interface SendPointsExpiringSoonNotificationUseCaseResult {
  emailSent: boolean;
}

@Injectable()
export class SendPointsExpiringSoonNotificationUseCase extends BaseNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_LOG_REPOSITORY) logRepo: INotificationLogRepository,
    @Inject(NOTIFICATION_PROCESSED_EVENT_REPOSITORY)
    processedEventRepo: INotificationProcessedEventRepository,
    @Inject(NOTIFICATION_DISPATCHER) dispatcher: INotificationDispatcher,
    @Inject(NOTIFICATION_CUSTOMER_PORT) private readonly customerPort: INotificationCustomerPort,
    @Inject(TRANSACTION_MANAGER) txManager: ITransactionManager,
    @Inject(NOTIFICATION_TEMPLATE_REPOSITORY)
    private readonly templateRepo: INotificationTemplateRepository,
    @Inject(NOTIFICATION_PLATFORM_PORT) private readonly tenantPort: INotificationPlatformPort,
    @Inject(LOCALIZATION_PORT) private readonly localizationPort: ILocalizationPort,
  ) {
    super(logRepo, processedEventRepo, dispatcher, txManager);
  }

  async execute(
    input: SendPointsExpiringSoonNotificationUseCaseInput,
  ): Promise<SendPointsExpiringSoonNotificationUseCaseResult> {
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

    const emailSent = await this.dispatchTemplates(templates, input, customer.email, {
      customerName: customer.name,
      pointsExpiringSoon: String(input.pointsExpiringSoon),
      earliestExpiresAt: input.earliestExpiresAt,
    });
    return { emailSent };
  }
}
