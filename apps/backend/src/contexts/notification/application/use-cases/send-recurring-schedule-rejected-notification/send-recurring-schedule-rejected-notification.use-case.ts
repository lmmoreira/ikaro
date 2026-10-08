import { Inject, Injectable } from '@nestjs/common';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
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
import { BaseNotificationUseCase } from '../base-notification.use-case';
import {
  RecurringScheduleNotificationInput,
  resolveRecurringScheduleContext,
} from '../recurring-schedule-notification.helpers';

export interface SendRecurringScheduleRejectedNotificationUseCaseInput extends RecurringScheduleNotificationInput {
  // APPROVAL_REJECTED: staff decided no. APPROVAL_EXPIRED: nobody decided in time.
  reason: 'APPROVAL_REJECTED' | 'APPROVAL_EXPIRED';
}

export interface SendRecurringScheduleRejectedNotificationUseCaseResult {
  emailSent: boolean;
}

// UC-071 / UC-070 A5 (M23-S28): tells the customer their request was not accepted or expired
// unanswered — two templates, because the copy differs (an expired request invites them to ask
// again; a rejection never names the staff member who decided).
@Injectable()
export class SendRecurringScheduleRejectedNotificationUseCase extends BaseNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_LOG_REPOSITORY) logRepo: INotificationLogRepository,
    @Inject(INBOX_REPOSITORY) inboxRepo: IInboxRepository,
    @Inject(NOTIFICATION_DISPATCHER) dispatcher: INotificationDispatcher,
    @Inject(NOTIFICATION_CUSTOMER_PORT) private readonly customerPort: INotificationCustomerPort,
    @Inject(NOTIFICATION_BOOKING_PORT) private readonly servicePort: INotificationBookingPort,
    @Inject(NOTIFICATION_PLATFORM_PORT) private readonly tenantPort: INotificationPlatformPort,
    @Inject(TRANSACTION_MANAGER) txManager: ITransactionManager,
    @Inject(NOTIFICATION_TEMPLATE_REPOSITORY)
    private readonly templateRepo: INotificationTemplateRepository,
    @Inject(LOCALIZATION_PORT) private readonly localizationPort: ILocalizationPort,
  ) {
    super(logRepo, inboxRepo, dispatcher, txManager);
  }

  async execute(
    input: SendRecurringScheduleRejectedNotificationUseCaseInput,
  ): Promise<SendRecurringScheduleRejectedNotificationUseCaseResult> {
    const trigger =
      input.reason === 'APPROVAL_EXPIRED'
        ? NotificationTemplateKey.RECURRING_SCHEDULE_EXPIRED_CUSTOMER
        : NotificationTemplateKey.RECURRING_SCHEDULE_REJECTED_CUSTOMER;

    const templates = await this.templateRepo.findAllByTriggerEvent(input.tenantId, trigger);
    if (templates.length === 0) {
      this.logger.warn('No template found — skipping', {
        tenantId: input.tenantId,
        triggerEvent: trigger,
      });
      return { emailSent: false };
    }

    const ctx = await resolveRecurringScheduleContext(
      {
        customerPort: this.customerPort,
        servicePort: this.servicePort,
        tenantPort: this.tenantPort,
      },
      input,
    );
    if (!ctx) {
      this.logger.warn('Customer or service not found — skipping', {
        tenantId: input.tenantId,
        correlationId: input.correlationId,
      });
      return { emailSent: false };
    }

    this.localizeTemplates(templates, this.localizationPort, ctx.locale);
    const emailSent = await this.dispatchTemplates(templates, input, ctx.customerEmail, {
      contactName: ctx.customerName,
      tenantName: ctx.tenantName,
      serviceName: ctx.serviceName,
    });
    return { emailSent };
  }
}
