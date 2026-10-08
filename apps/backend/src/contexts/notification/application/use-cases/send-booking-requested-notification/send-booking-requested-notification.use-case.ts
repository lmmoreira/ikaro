import { Inject, Injectable } from '@nestjs/common';
import { formatMoney } from '../../../../../shared/utils/money-format';
import { escapeHtml } from '../../../../../shared/utils/escape-html';
import { Address } from '../../../../../shared/value-objects/address';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
import { SendBookingRequestedNotificationDto } from '../../dtos/send-booking-requested-notification.dto';
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
import { formatEmailDateTime, labelledLine } from '../notification-email-format.helpers';
import { BaseNotificationUseCase } from '../base-notification.use-case';

const ADMIN_TRIGGER = NotificationTemplateKey.BOOKING_REQUESTED_ADMIN;
const CUSTOMER_TRIGGER = NotificationTemplateKey.BOOKING_REQUESTED_CUSTOMER;
const LINES_KEY = 'managerEmailLines';

export interface SendBookingRequestedNotificationUseCaseInput extends BaseContactNotificationDto {
  scheduledAt: SendBookingRequestedNotificationDto['scheduledAt'];
  totalPrice: SendBookingRequestedNotificationDto['totalPrice'];
  lines: SendBookingRequestedNotificationDto['lines'];
  pickupAddress: SendBookingRequestedNotificationDto['pickupAddress'];
}

export interface SendBookingRequestedNotificationUseCaseResult {
  adminEmailSent: boolean;
  customerEmailSent: boolean;
}

@Injectable()
export class SendBookingRequestedNotificationUseCase extends BaseNotificationUseCase {
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
    input: SendBookingRequestedNotificationUseCaseInput,
  ): Promise<SendBookingRequestedNotificationUseCaseResult> {
    const serviceNames = input.lines.map((l) => escapeHtml(l.serviceNameAtBooking)).join(', ');
    const { adminTemplates, customerTemplates, managerEmails, tenantInfo } = await this.loadContext(
      input.tenantId,
    );

    const locale = tenantInfo?.locale ?? DEFAULT_LOCALE;
    this.localizeTemplates(adminTemplates, this.localizationPort, locale);
    this.localizeTemplates(customerTemplates, this.localizationPort, locale);
    const shared = this.buildVariables(input, tenantInfo, serviceNames);
    const adminVariables: TemplateVariables<typeof ADMIN_TRIGGER> = {
      contactName: shared.contactName,
      scheduledAt: shared.scheduledAt,
      serviceNames: shared.serviceNames,
      totalPrice: shared.totalPrice,
      pickupAddressLine: this.buildPickupAddressLine(input, locale),
    };
    const customerVariables: TemplateVariables<typeof CUSTOMER_TRIGGER> = {
      contactName: shared.contactName,
      scheduledAt: shared.scheduledAt,
      serviceNames: shared.serviceNames,
      totalPrice: shared.totalPrice,
      tenantName: escapeHtml(tenantInfo?.name ?? ''),
    };

    const adminEmailSent =
      managerEmails.length > 0
        ? await this.dispatchTemplatesToMany(adminTemplates, input, managerEmails, adminVariables)
        : false;

    const customerEmailSent = await this.dispatchTemplates(
      customerTemplates,
      input,
      input.contactEmail,
      customerVariables,
    );

    return { adminEmailSent, customerEmailSent };
  }

  private async loadContext(tenantId: string) {
    const [adminTemplates, customerTemplates, managerEmails, tenantInfo] = await Promise.all([
      this.templateRepo.findAllByTriggerEvent(tenantId, ADMIN_TRIGGER),
      this.templateRepo.findAllByTriggerEvent(tenantId, CUSTOMER_TRIGGER),
      this.staffPort.getManagerEmails(tenantId),
      this.tenantPort.getTenantInfo(tenantId),
    ]);
    return { adminTemplates, customerTemplates, managerEmails, tenantInfo };
  }

  private buildVariables(
    input: SendBookingRequestedNotificationUseCaseInput,
    tenantInfo: Awaited<ReturnType<INotificationPlatformPort['getTenantInfo']>>,
    serviceNames: string,
  ): { contactName: string; scheduledAt: string; serviceNames: string; totalPrice: string } {
    const locale = tenantInfo?.locale ?? DEFAULT_LOCALE;
    return {
      contactName: escapeHtml(input.contactName),
      scheduledAt: formatEmailDateTime(input.scheduledAt, tenantInfo?.timezone ?? 'UTC', {
        dateFormat: tenantInfo?.dateFormat ?? DEFAULT_DATE_FORMAT,
        timeFormat: tenantInfo?.timeFormat ?? DEFAULT_TIME_FORMAT,
      }),
      serviceNames,
      totalPrice: formatMoney(input.totalPrice.amount, locale, input.totalPrice.currency),
    };
  }

  // The manager needs to know where to go for a pickup; a booking without one has no such line.
  private buildPickupAddressLine(
    input: SendBookingRequestedNotificationUseCaseInput,
    locale: string,
  ): string {
    const pickup = input.pickupAddress;
    if (!pickup) return '';
    const address = Address.reconstitute({
      street: pickup.street,
      number: pickup.number,
      complement: pickup.complement ?? undefined,
      neighborhood: pickup.neighborhood ?? undefined,
      city: pickup.city,
      state: pickup.state,
      zipCode: pickup.zipCode,
    });
    const label = this.localizationPort.getEmailTableHeaders(LINES_KEY, locale).pickupAddressLabel;
    return labelledLine(label ?? '', address.format());
  }
}
