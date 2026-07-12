import { Envelope } from '../../shared/domain/envelope';
import { IEventBus } from '../../shared/ports/event-bus.port';
import { IOutboxPublisher } from '../../shared/ports/outbox-publisher.port';
import { ITriggerBus } from '../../shared/ports/trigger-bus.port';

// Also bound to OUTBOX_PUBLISHER in some integration-app helpers (TD24-S02) — no deferral logic
// needed here for two independent reasons, depending on caller: in unit specs,
// InMemoryTransactionManager creates no ambient transaction context, so scheduleAfterCommit()
// falls through to immediate execution anyway; in integration apps that DO use a real
// TypeOrmTransactionManager (platform/customer), subscribe() is a documented no-op below — there
// are no handlers to accidentally run mid-transaction, so deferring publish() would only delay
// this class's own bookkeeping, not prevent any real hazard. See RoutingInMemoryEventBus for the
// bus that actually dispatches to subscribers and needs the deferral.
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
