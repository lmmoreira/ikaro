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

export interface SendRecurringScheduleEndedNotificationUseCaseInput extends RecurringScheduleNotificationInput {
  endedBy: 'CUSTOMER' | 'STAFF';
}

export interface SendRecurringScheduleEndedNotificationUseCaseResult {
  emailSent: boolean;
}

// UC-070 A2 (M23-S28): tells the customer their schedule was ended and its future occurrences
// cancelled — worded for who ended it. The cancelled occurrences send no email of their own
// (BookingCancelled.cancelledByScheduleEnd), so this is the only one.
@Injectable()
export class SendRecurringScheduleEndedNotificationUseCase extends BaseNotificationUseCase {
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
    input: SendRecurringScheduleEndedNotificationUseCaseInput,
  ): Promise<SendRecurringScheduleEndedNotificationUseCaseResult> {
    const trigger =
      input.endedBy === 'STAFF'
        ? NotificationTemplateKey.RECURRING_SCHEDULE_ENDED_BY_STAFF_CUSTOMER
        : NotificationTemplateKey.RECURRING_SCHEDULE_ENDED_CUSTOMER;

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
