import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
import { SendBookingInfoRequestedNotificationDto } from '../../dtos/send-booking-info-requested-notification.dto';
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
  NotificationTenantInfo,
} from '../../ports/notification-platform.port';
import { ILocalizationPort, LOCALIZATION_PORT } from '../../ports/localization.port';
import { DEFAULT_LOCALE } from '../../../domain/notification-locale.constants';
import { BaseNotificationUseCase } from '../base-notification.use-case';

const TRIGGER = NotificationTemplateKey.BOOKING_INFO_REQUESTED_CUSTOMER;
const GUEST_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export type SendBookingInfoRequestedNotificationUseCaseInput =
  SendBookingInfoRequestedNotificationDto;

export interface SendBookingInfoRequestedNotificationUseCaseResult {
  emailSent: boolean;
}

@Injectable()
export class SendBookingInfoRequestedNotificationUseCase extends BaseNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_LOG_REPOSITORY) logRepo: INotificationLogRepository,
    @Inject(NOTIFICATION_PROCESSED_EVENT_REPOSITORY)
    processedEventRepo: INotificationProcessedEventRepository,
    @Inject(NOTIFICATION_DISPATCHER) dispatcher: INotificationDispatcher,
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
    input: SendBookingInfoRequestedNotificationUseCaseInput,
  ): Promise<SendBookingInfoRequestedNotificationUseCaseResult> {
    const templates = await this.templateRepo.findAllByTriggerEvent(input.tenantId, TRIGGER);
    if (templates.length === 0) {
      this.logger.warn('No template found — skipping', {
        tenantId: input.tenantId,
        triggerEvent: TRIGGER,
      });
      return { emailSent: false };
    }

    const tenantInfo = await this.tenantPort.getTenantInfo(input.tenantId);
    const locale = tenantInfo?.locale ?? DEFAULT_LOCALE;
    this.localizeTemplates(templates, this.localizationPort, locale);

    const respondLink = this.buildRespondLink(input, tenantInfo);

    const emailSent = await this.dispatchTemplates(templates, input, input.contactEmail, {
      contactName: input.contactName,
      informationNeeded: input.informationNeeded,
      respondLink,
    });
    return { emailSent };
  }

  private buildRespondLink(
    input: SendBookingInfoRequestedNotificationUseCaseInput,
    tenantInfo: NotificationTenantInfo | null,
  ): string {
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');

    if (input.customerId !== null) {
      return `${frontendUrl}/dashboard/bookings/${input.bookingId}`;
    }

    const secret = this.config.getOrThrow<string>('JWT_SECRET');
    const token = jwt.sign(
      {
        bookingId: input.bookingId,
        tenantId: input.tenantId,
        tenantSlug: tenantInfo?.slug,
        contactEmail: input.contactEmail,
      },
      secret,
      { expiresIn: GUEST_TOKEN_TTL_SECONDS },
    );
    return `${frontendUrl}/bookings/${input.bookingId}/submit-info?token=${token}`;
  }
}
