import { INotificationProcessedEventRepository } from '../../../contexts/notification/application/ports/processed-event-repository.port';

export class InMemoryNotificationProcessedEventRepository implements INotificationProcessedEventRepository {
  private readonly processed = new Set<string>();

  private key(eventId: string, notificationType: string, channel: string): string {
    return `${eventId}:${notificationType}:${channel}`;
  }

  async isDuplicate(eventId: string, notificationType: string, channel: string): Promise<boolean> {
    return this.processed.has(this.key(eventId, notificationType, channel));
  }

  async markProcessed(eventId: string, notificationType: string, channel: string): Promise<void> {
    this.processed.add(this.key(eventId, notificationType, channel));
  }

  clear(): void {
    this.processed.clear();
  }
}
