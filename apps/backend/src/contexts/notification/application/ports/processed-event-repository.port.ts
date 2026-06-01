export const NOTIFICATION_PROCESSED_EVENT_REPOSITORY = Symbol(
  'INotificationProcessedEventRepository',
);

export interface INotificationProcessedEventRepository {
  isDuplicate(eventId: string, notificationType: string, channel: string): Promise<boolean>;
  markProcessed(eventId: string, notificationType: string, channel: string): Promise<void>;
}
