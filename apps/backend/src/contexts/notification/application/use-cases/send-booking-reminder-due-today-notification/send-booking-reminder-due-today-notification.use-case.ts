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
  INotificationPlatformPort,
  NOTIFICATION_PLATFORM_PORT,
} from '../../ports/notification-platform.port';
import {
  INotificationTemplateRepository,
  NOTIFICATION_TEMPLATE_REPOSITORY,
} from '../../ports/notification-template-repository.port';
import { ILocalizationPort, LOCALIZATION_PORT } from '../../ports/localization.port';
import { BaseBookingReminderNotificationUseCase } from '../base-booking-reminder-notification.use-case';

export { BookingReminderNotificationUseCaseResult as SendBookingReminderDueTodayNotificationUseCaseResult } from '../base-booking-reminder-notification.use-case';

@Injectable()
export class SendBookingReminderDueTodayNotificationUseCase extends BaseBookingReminderNotificationUseCase {
  protected readonly reminderTemplateKey = NotificationTemplateKey.BOOKING_REMINDER_DUE_TODAY;
  protected readonly eventName = 'BookingReminderDueToday';

  constructor(
    @Inject(NOTIFICATION_LOG_REPOSITORY) logRepo: INotificationLogRepository,
    @Inject(NOTIFICATION_PROCESSED_EVENT_REPOSITORY)
    processedEventRepo: INotificationProcessedEventRepository,
    @Inject(NOTIFICATION_DISPATCHER) dispatcher: INotificationDispatcher,
    @Inject(NOTIFICATION_PLATFORM_PORT) tenantPort: INotificationPlatformPort,
    @Inject(TRANSACTION_MANAGER) txManager: ITransactionManager,
    @Inject(NOTIFICATION_TEMPLATE_REPOSITORY) templateRepo: INotificationTemplateRepository,
    @Inject(LOCALIZATION_PORT) localizationPort: ILocalizationPort,
  ) {
    super(
      logRepo,
      processedEventRepo,
      dispatcher,
      tenantPort,
      txManager,
      templateRepo,
      localizationPort,
    );
  }
}
