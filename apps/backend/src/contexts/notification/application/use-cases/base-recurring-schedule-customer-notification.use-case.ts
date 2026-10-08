import { Inject, Injectable } from '@nestjs/common';
import { NotificationTemplateKey } from '../../domain/notification-template-key.enum';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { IInboxRepository, INBOX_REPOSITORY } from '../../../../shared/ports/inbox.port';
import {
  INotificationBookingPort,
  NOTIFICATION_BOOKING_PORT,
} from '../ports/notification-booking.port';
import {
  INotificationCustomerPort,
  NOTIFICATION_CUSTOMER_PORT,
} from '../ports/notification-customer.port';
import {
  INotificationDispatcher,
  NOTIFICATION_DISPATCHER,
} from '../ports/notification-dispatcher.port';
import {
  INotificationLogRepository,
  NOTIFICATION_LOG_REPOSITORY,
} from '../ports/notification-log-repository.port';
import {
  INotificationPlatformPort,
  NOTIFICATION_PLATFORM_PORT,
} from '../ports/notification-platform.port';
import {
  INotificationTemplateRepository,
  NOTIFICATION_TEMPLATE_REPOSITORY,
} from '../ports/notification-template-repository.port';
import { ILocalizationPort, LOCALIZATION_PORT } from '../ports/localization.port';
import { BaseNotificationUseCase } from './base-notification.use-case';
import {
  RecurringScheduleNotificationContext,
  RecurringScheduleNotificationInput,
  resolveRecurringScheduleContext,
} from './recurring-schedule-notification.helpers';

export interface RecurringScheduleCustomerNotificationUseCaseResult {
  emailSent: boolean;
}

// The three recurring-schedule emails that go to the schedule's customer (confirmed, not accepted
// or expired, ended) differ only in which template they pick and which extra variables the copy
// uses; looking up the template, resolving the customer, service and tenant locale, skipping
// quietly when any is gone, localizing and dispatching is the same flow (M23-S28). The subclass
// declares its input and the two hooks, and carries no constructor of its own: Nest resolves the
// injected ports from this class's parameter metadata.
@Injectable()
export abstract class BaseRecurringScheduleCustomerNotificationUseCase<
  TInput extends RecurringScheduleNotificationInput,
> extends BaseNotificationUseCase {
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

  protected abstract templateKeyFor(input: TInput): NotificationTemplateKey;

  // Variables the copy uses on top of contactName / tenantName / serviceName.
  protected extraVariables(
    _input: TInput,
    _context: RecurringScheduleNotificationContext,
  ): Record<string, string> {
    return {};
  }

  async execute(input: TInput): Promise<RecurringScheduleCustomerNotificationUseCaseResult> {
    const trigger = this.templateKeyFor(input);
    const templates = await this.templateRepo.findAllByTriggerEvent(input.tenantId, trigger);
    if (templates.length === 0) {
      this.logger.warn('No template found — skipping', {
        tenantId: input.tenantId,
        triggerEvent: trigger,
      });
      return { emailSent: false };
    }

    const context = await resolveRecurringScheduleContext(
      {
        customerPort: this.customerPort,
        servicePort: this.servicePort,
        tenantPort: this.tenantPort,
      },
      input,
    );
    if (!context) {
      this.logger.warn('Customer or service not found — skipping', {
        tenantId: input.tenantId,
        correlationId: input.correlationId,
      });
      return { emailSent: false };
    }

    this.localizeTemplates(templates, this.localizationPort, context.locale);
    const emailSent = await this.dispatchTemplates(templates, input, context.customerEmail, {
      contactName: context.customerName,
      tenantName: context.tenantName,
      serviceName: context.serviceName,
      ...this.extraVariables(input, context),
    });
    return { emailSent };
  }
}
