import { INotificationLogRepository } from '../../../contexts/notification/application/ports/notification-log-repository.port';
import { NotificationLog } from '../../../contexts/notification/domain/notification-log.aggregate';

export class InMemoryNotificationLogRepository implements INotificationLogRepository {
  private readonly store: NotificationLog[] = [];
  private nextSaveError?: Error;

  // The next save() throws once, e.g. to prove a lost audit-log row after a sent email is survived.
  failNextSave(error: Error): void {
    this.nextSaveError = error;
  }

  async save(log: NotificationLog): Promise<void> {
    if (this.nextSaveError) {
      const err = this.nextSaveError;
      this.nextSaveError = undefined;
      throw err;
    }
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

  clear(): void {
    this.store.length = 0;
  }
}
