import { DomainEvent } from '../../shared/domain/domain-event';
import { IEventBus } from '../../shared/ports/event-bus.port';

export class InMemoryEventBus implements IEventBus {
  readonly published: DomainEvent[] = [];

  async publish(event: DomainEvent): Promise<void> {
    this.published.push(event);
  }

  subscribe<T extends DomainEvent>(
    _eventName: string,
    _handler: (event: T) => Promise<void>,
    _consumerName: string,
  ): void {
    // no-op: unit tests call handlers directly, not via event routing
  }

  clear(): void {
    this.published.length = 0;
  }
}
