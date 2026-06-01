import {
  INotificationDispatcher,
  OutboundMessage,
} from '../../contexts/notification/application/ports/notification-dispatcher.port';

export class InMemoryNotificationDispatcher implements INotificationDispatcher {
  readonly dispatched: OutboundMessage[] = [];
  private nextError?: Error;

  async dispatch(message: OutboundMessage): Promise<void> {
    if (this.nextError) {
      const err = this.nextError;
      this.nextError = undefined;
      throw err;
    }
    this.dispatched.push(message);
  }

  failNext(error: Error): void {
    this.nextError = error;
  }

  clear(): void {
    this.dispatched.length = 0;
  }
}
