import { Envelope } from '../../shared/domain/envelope';
import { IEventBus } from '../../shared/ports/event-bus.port';
import { IOutboxPublisher } from '../../shared/ports/outbox-publisher.port';
import { ITriggerBus } from '../../shared/ports/trigger-bus.port';

// Also bound to OUTBOX_PUBLISHER in some integration-app helpers (TD24-S02) — no deferral logic
// needed here: InMemoryTransactionManager (used by unit specs) creates no ambient transaction
// context, so scheduleAfterCommit() would fall through to immediate execution anyway. See
// RoutingInMemoryEventBus for the real-transaction deferral this double doesn't need.
export class InMemoryEventBus implements IEventBus, ITriggerBus, IOutboxPublisher {
  readonly published: Envelope[] = [];
  readonly publishedTriggers: string[] = [];

  async publish(event: Envelope): Promise<void> {
    this.published.push(event);
  }

  subscribe<T extends Envelope>(
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
