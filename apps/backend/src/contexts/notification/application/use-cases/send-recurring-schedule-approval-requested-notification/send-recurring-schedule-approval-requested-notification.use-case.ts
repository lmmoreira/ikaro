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
import {
  INotificationStaffPort,
  NOTIFICATION_STAFF_PORT,
} from '../../ports/notification-staff.port';
import { ILocalizationPort, LOCALIZATION_PORT } from '../../ports/localization.port';
import { BaseNotificationUseCase } from '../base-notification.use-case';
import {
  buildScheduleSummaryVariables,
  formatLocalDateTime,
  RecurringScheduleNotificationInput,
  RecurringScheduleSummaryInput,
  resolveRecurringScheduleContext,
} from '../recurring-schedule-notification.helpers';

const TRIGGER = NotificationTemplateKey.RECURRING_SCHEDULE_APPROVAL_REQUESTED_ADMIN;

export interface SendRecurringScheduleApprovalRequestedNotificationUseCaseInput extends RecurringScheduleNotificationInput {
  daysOfWeek: RecurringScheduleSummaryInput['daysOfWeek'];
  startTime: RecurringScheduleSummaryInput['startTime'];
  startsOn: RecurringScheduleSummaryInput['startsOn'];
  endsOn: RecurringScheduleSummaryInput['endsOn'];
  // ISO-8601 instant after which the request expires unanswered.
  approvalHoldExpiresAt: string;
}

export interface SendRecurringScheduleApprovalRequestedNotificationUseCaseResult {
  adminEmailSent: boolean;
}

// UC-070 (M23-S28): the alert to the tenant's managers that a MANUAL_APPROVAL request is waiting,
// so it does not sit unseen until its hold expires. The customer gets no email for this event.
@Injectable()
export class SendRecurringScheduleApprovalRequestedNotificationUseCase extends BaseNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_LOG_REPOSITORY) logRepo: INotificationLogRepository,
    @Inject(INBOX_REPOSITORY) inboxRepo: IInboxRepository,
    @Inject(NOTIFICATION_DISPATCHER) dispatcher: INotificationDispatcher,
    @Inject(NOTIFICATION_CUSTOMER_PORT) private readonly customerPort: INotificationCustomerPort,
    @Inject(NOTIFICATION_BOOKING_PORT) private readonly servicePort: INotificationBookingPort,
    @Inject(NOTIFICATION_PLATFORM_PORT) private readonly tenantPort: INotificationPlatformPort,
    @Inject(NOTIFICATION_STAFF_PORT) private readonly staffPort: INotificationStaffPort,
    @Inject(TRANSACTION_MANAGER) txManager: ITransactionManager,
    @Inject(NOTIFICATION_TEMPLATE_REPOSITORY)
    private readonly templateRepo: INotificationTemplateRepository,
    @Inject(LOCALIZATION_PORT) private readonly localizationPort: ILocalizationPort,
  ) {
    super(logRepo, inboxRepo, dispatcher, txManager);
  }

  async execute(
    input: SendRecurringScheduleApprovalRequestedNotificationUseCaseInput,
  ): Promise<SendRecurringScheduleApprovalRequestedNotificationUseCaseResult> {
    const templates = await this.templateRepo.findAllByTriggerEvent(input.tenantId, TRIGGER);
    if (templates.length === 0) {
      this.logger.warn('No template found — skipping', {
        tenantId: input.tenantId,
        triggerEvent: TRIGGER,
      });
      return { adminEmailSent: false };
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
      return { adminEmailSent: false };
    }

    const managerEmails = await this.staffPort.getManagerEmails(input.tenantId);
    if (managerEmails.length === 0) return { adminEmailSent: false };

    this.localizeTemplates(templates, this.localizationPort, ctx.locale);
    const adminEmailSent = await this.dispatchTemplatesToMany(templates, input, managerEmails, {
      contactName: ctx.customerName,
      serviceName: ctx.serviceName,
      holdExpiresAt: formatLocalDateTime(input.approvalHoldExpiresAt, ctx.timezone, ctx.locale),
      ...buildScheduleSummaryVariables(input, ctx.locale),
    });
    return { adminEmailSent };
  }
}
