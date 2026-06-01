import { NotificationLog } from '../../domain/notification-log.entity';

export const NOTIFICATION_LOG_REPOSITORY = Symbol('INotificationLogRepository');

export interface INotificationLogRepository {
  save(log: NotificationLog): Promise<void>;
}
