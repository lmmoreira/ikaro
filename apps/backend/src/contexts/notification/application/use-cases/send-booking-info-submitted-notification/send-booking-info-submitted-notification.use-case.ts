import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
import { SendBookingInfoSubmittedNotificationDto } from '../../dtos/send-booking-info-submitted-notification.dto';
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

const TRIGGER = NotificationTemplateKey.BOOKING_INFO_SUBMITTED_ADMIN;

export type SendBookingInfoSubmittedNotificationUseCaseInput = SendBookingInfoSubmittedNotificationDto;

export interface SendBookingInfoSubmittedNotificationUseCaseResult {
  emailSent: boolean;
}

@Injectable()
export class SendBookingInfoSubmittedNotificationUseCase extends BaseNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_LOG_REPOSITORY) logRepo: INotificationLogRepository,
    @Inject(NOTIFICATION_PROCESSED_EVENT_REPOSITORY)
    processedEventRepo: INotificationProcessedEventRepository,
    @Inject(NOTIFICATION_DISPATCHER) dispatcher: INotificationDispatcher,
    @Inject(NOTIFICATION_STAFF_PORT) private readonly staffPort: INotificationStaffPort,
    @Inject(TRANSACTION_MANAGER) txManager: ITransactionManager,
    @Inject(NOTIFICATION_TEMPLATE_REPOSITORY)
    private readonly templateRepo: INotificationTemplateRepository,
    @Inject(NOTIFICATION_PLATFORM_PORT) private readonly tenantPort: INotificationPlatformPort,
    @Inject(LOCALIZATION_PORT) private readonly localizationPort: ILocalizationPort,
    private readonly config: ConfigService,
  ) {
    super(logRepo, processedEventRepo, dispatcher, txManager);
  }

  async execute(
    input: SendBookingInfoSubmittedNotificationUseCaseInput,
  ): Promise<SendBookingInfoSubmittedNotificationUseCaseResult> {
    const templates = await this.templateRepo.findAllByTriggerEvent(input.tenantId, TRIGGER);
    if (templates.length === 0) {
      this.logger.warn('No template found — skipping', {
        tenantId: input.tenantId,
        triggerEvent: TRIGGER,
      });
      return { emailSent: false };
    }

    const managerEmails = await this.staffPort.getManagerEmails(input.tenantId);
    if (managerEmails.length === 0) return { emailSent: false };

    const tenantInfo = await this.tenantPort.getTenantInfo(input.tenantId);
    const locale = tenantInfo?.locale ?? DEFAULT_LOCALE;
    this.localizeTemplates(templates, this.localizationPort, locale);

    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    const bookingLink = `${frontendUrl}/dashboard/bookings/${input.bookingId}`;
    const customerResponse =
      typeof input.infoPayload['notes'] === 'string' ? input.infoPayload['notes'] : '';

    const emailSent = await this.dispatchTemplatesToMany(templates, input, managerEmails, {
      submittedByEmail: input.submittedByEmail,
      bookingId: input.bookingId,
      customerResponse,
      bookingLink,
    });
    return { emailSent };
  }
}
