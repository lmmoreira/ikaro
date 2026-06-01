import { ITransactionManager } from '../../../../shared/ports/transaction-manager.port';
import { NotificationLog } from '../../domain/notification-log.entity';
import { INotificationDispatcher } from '../ports/notification-dispatcher.port';
import { INotificationLogRepository } from '../ports/notification-log-repository.port';
import { INotificationProcessedEventRepository } from '../ports/processed-event-repository.port';

export abstract class BaseNotificationUseCase {
  constructor(
    protected readonly logRepo: INotificationLogRepository,
    protected readonly processedEventRepo: INotificationProcessedEventRepository,
    protected readonly dispatcher: INotificationDispatcher,
    protected readonly txManager: ITransactionManager,
  ) {}

  protected async isAlreadySent(
    eventId: string,
    notificationType: string,
    channel: string,
  ): Promise<boolean> {
    return this.processedEventRepo.isDuplicate(eventId, notificationType, channel);
  }

  protected async saveLog(
    tenantId: string,
    eventId: string,
    notificationType: string,
    channel: string,
    recipientEmail: string,
  ): Promise<void> {
    const log = NotificationLog.create({
      tenantId,
      eventId,
      notificationType,
      channel,
      recipientEmail,
    });
    log.markSent();
    await this.txManager.run(async () => {
      await this.logRepo.save(log);
      await this.processedEventRepo.markProcessed(eventId, notificationType, channel);
    });
  }

  protected async saveFailedLog(
    tenantId: string,
    eventId: string,
    notificationType: string,
    channel: string,
    recipientEmail: string,
    errorMessage: string,
  ): Promise<void> {
    const log = NotificationLog.create({
      tenantId,
      eventId,
      notificationType,
      channel,
      recipientEmail,
    });
    log.markFailed(errorMessage);
    await this.txManager.run(async () => {
      await this.logRepo.save(log);
    });
  }
}
