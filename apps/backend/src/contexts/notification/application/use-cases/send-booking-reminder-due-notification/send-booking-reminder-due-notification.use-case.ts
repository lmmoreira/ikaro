import { Inject, Injectable } from '@nestjs/common';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
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
  INotificationTenantPort,
  NOTIFICATION_TENANT_PORT,
} from '../../ports/notification-tenant.port';
import { BaseBookingReminderNotificationUseCase } from '../base-booking-reminder-notification.use-case';

export { BookingReminderNotificationUseCaseResult as SendBookingReminderDueNotificationUseCaseResult } from '../base-booking-reminder-notification.use-case';

@Injectable()
export class SendBookingReminderDueNotificationUseCase extends BaseBookingReminderNotificationUseCase {
  protected readonly reminderTemplateKey = NotificationTemplateKey.BOOKING_REMINDER_DUE;
  protected readonly reminderSubject = 'Lembrete: seu agendamento é amanhã!';

  constructor(
    @Inject(NOTIFICATION_LOG_REPOSITORY) logRepo: INotificationLogRepository,
    @Inject(NOTIFICATION_PROCESSED_EVENT_REPOSITORY)
    processedEventRepo: INotificationProcessedEventRepository,
    @Inject(NOTIFICATION_DISPATCHER) dispatcher: INotificationDispatcher,
    @Inject(NOTIFICATION_TENANT_PORT) tenantPort: INotificationTenantPort,
    @Inject(TRANSACTION_MANAGER) txManager: ITransactionManager,
  ) {
    super(logRepo, processedEventRepo, dispatcher, tenantPort, txManager);
  }
}
