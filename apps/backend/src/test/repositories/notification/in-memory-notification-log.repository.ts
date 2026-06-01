import { INotificationLogRepository } from '../../../contexts/notification/application/ports/notification-log-repository.port';
import { NotificationLog } from '../../../contexts/notification/domain/notification-log.entity';

export class InMemoryNotificationLogRepository implements INotificationLogRepository {
  private readonly store: NotificationLog[] = [];

  async save(log: NotificationLog): Promise<void> {
    const idx = this.store.findIndex((l) => l.id === log.id);
    if (idx >= 0) {
      this.store[idx] = log;
    } else {
      this.store.push(log);
    }
  }

  get all(): NotificationLog[] {
    return [...this.store];
  }
}
