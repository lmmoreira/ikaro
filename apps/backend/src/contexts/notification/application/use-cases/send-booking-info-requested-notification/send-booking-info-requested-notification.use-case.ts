import { Inject, Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import {
  APPLICATION_CONFIG,
  IApplicationConfig,
} from '../../../../../shared/ports/application-config.port';
import { escapeHtml } from '../../../../../shared/utils/escape-html';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
import { SendBookingInfoRequestedNotificationDto } from '../../dtos/send-booking-info-requested-notification.dto';
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
import { TemplateVariables } from '../../../domain/notification-template-key.mapping';
import { BaseNotificationUseCase } from '../base-notification.use-case';

const TRIGGER = NotificationTemplateKey.BOOKING_INFO_REQUESTED_CUSTOMER;
const GUEST_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface SendBookingInfoRequestedNotificationUseCaseInput extends BaseContactNotificationDto {
  bookingId: SendBookingInfoRequestedNotificationDto['bookingId'];
  customerId: SendBookingInfoRequestedNotificationDto['customerId'];
  informationNeeded: SendBookingInfoRequestedNotificationDto['informationNeeded'];
}

export interface SendBookingInfoRequestedNotificationUseCaseResult {
  emailSent: boolean;
}

@Injectable()
export class SendBookingInfoRequestedNotificationUseCase extends BaseNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_LOG_REPOSITORY) logRepo: INotificationLogRepository,
    @Inject(INBOX_REPOSITORY) inboxRepo: IInboxRepository,
    @Inject(NOTIFICATION_DISPATCHER) dispatcher: INotificationDispatcher,
    @Inject(TRANSACTION_MANAGER) txManager: ITransactionManager,
    @Inject(NOTIFICATION_TEMPLATE_REPOSITORY)
    private readonly templateRepo: INotificationTemplateRepository,
    @Inject(NOTIFICATION_PLATFORM_PORT) private readonly tenantPort: INotificationPlatformPort,
    @Inject(LOCALIZATION_PORT) private readonly localizationPort: ILocalizationPort,
    @Inject(APPLICATION_CONFIG) private readonly config: IApplicationConfig,
  ) {
    super(logRepo, inboxRepo, dispatcher, txManager);
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
    if (input.customerId !== null && tenantInfo === null) {
      // The customer's link is built on the tenant slug; without it there is nothing valid to send.
      this.logger.warn('Tenant not found — skipping', { tenantId: input.tenantId });
      return { emailSent: false };
    }
    const locale = tenantInfo?.locale ?? DEFAULT_LOCALE;
    this.localizeTemplates(templates, this.localizationPort, locale);

    const respondLink = this.buildRespondLink(input, tenantInfo);

    const variables: TemplateVariables<typeof TRIGGER> = {
      contactName: escapeHtml(input.contactName),
      informationNeeded: escapeHtml(input.informationNeeded),
      respondLink,
    };
    const emailSent = await this.dispatchTemplates(templates, input, input.contactEmail, variables);
    return { emailSent };
  }

  private buildRespondLink(
    input: SendBookingInfoRequestedNotificationUseCaseInput,
    tenantInfo: NotificationTenantInfo | null,
  ): string {
    const frontendUrl = this.config.getOrThrow('FRONTEND_URL');

    if (input.customerId !== null) {
      // A customer answers from their own booking page; the dashboard is staff-only.
      return `${frontendUrl}/${tenantInfo?.slug ?? ''}/my-account/bookings/${input.bookingId}`;
    }

    const secret = this.config.getOrThrow('JWT_SECRET');
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
