import { DomainEvent } from '../../shared/domain/domain-event';
import { IEventBus } from '../../shared/ports/event-bus.port';
import { ITriggerBus } from '../../shared/ports/trigger-bus.port';

export class InMemoryEventBus implements IEventBus, ITriggerBus {
  readonly published: DomainEvent[] = [];
  readonly publishedTriggers: string[] = [];

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

  registerTrigger(_name: string, _handler: () => Promise<void>, _consumerName: string): void {
    // no-op: unit tests call handlers directly, not via trigger routing
  }

  async publishTrigger(name: string): Promise<void> {
    this.publishedTriggers.push(name);
  }

  clear(): void {
    this.published.length = 0;
    this.publishedTriggers.length = 0;
  }
}
