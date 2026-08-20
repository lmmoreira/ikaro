import { Envelope } from '../../shared/domain/envelope';
import { IEventBus } from '../../shared/ports/event-bus.port';
import { IOutboxPublisher } from '../../shared/ports/outbox-publisher.port';
import { ITriggerBus } from '../../shared/ports/trigger-bus.port';

// Sentinel so `undefined`/`null` can themselves be injected as the rejection value — mirrors
// InMemoryCachePort's failNextGet/Set/Del convention (docs/ENGINEERING_RULES.md § InMemory
// doubles): "no pending failure" is tracked by field presence, not by the value's own truthiness.
const NONE = Symbol('no pending publish failure');

// The recorded handler is widened to Envelope (from the subscribe<T>() call's own T extends
// Envelope) so a real event instance can be passed back into it from a spec without a contravariant
// type error — every concrete event/command the codebase publishes is itself an Envelope subclass.
export interface RecordedSubscription {
  eventName: string;
  handler: (event: Envelope) => Promise<void>;
  consumerName: string;
}

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
  readonly subscriptions: RecordedSubscription[] = [];
  private nextPublishError: unknown = NONE;

  async publish(event: Envelope): Promise<void> {
    if (this.nextPublishError !== NONE) {
      const err = this.nextPublishError;
      this.nextPublishError = NONE;
      throw err;
    }
    this.published.push(event);
  }

  failNextPublish(error: unknown): void {
    this.nextPublishError = error;
  }

  // Records the subscription (event name, handler, consumer name) for state-based assertions
  // instead of dispatching — unit tests call handlers directly via `.subscriptions`, not through
  // routed publish(). See RoutingInMemoryEventBus for the bus that actually dispatches.
  subscribe<T extends Envelope>(
    eventName: string,
    handler: (event: T) => Promise<void>,
    consumerName: string,
  ): void {
    this.subscriptions.push({
      eventName,
      handler: handler as (event: Envelope) => Promise<void>,
      consumerName,
    });
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
    this.subscriptions.length = 0;
  }
}
