import { Envelope } from '../../shared/domain/envelope';
import { IEventBus } from '../../shared/ports/event-bus.port';
import { IOutboxPublisher } from '../../shared/ports/outbox-publisher.port';
import { IPushableEventBus } from '../../shared/ports/pushable-event-bus.port';
import { ITriggerBus } from '../../shared/ports/trigger-bus.port';

// Sentinel so `undefined`/`null` can themselves be injected as the rejection value — mirrors
// InMemoryCachePort's failNextGet/Set/Del convention (docs/ENGINEERING_RULES.md § InMemory
// doubles): "no pending failure" is tracked by field presence, not by the value's own truthiness.
const NONE = Symbol('no pending publish failure');
const NONE_DISPATCH = Symbol('no pending push-dispatch failure');

export interface DispatchedPushMessage {
  subscriptionFullName: string;
  base64Data: string;
}

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
export class InMemoryEventBus
  implements IEventBus, ITriggerBus, IOutboxPublisher, IPushableEventBus
{
  readonly published: Envelope[] = [];
  // Every publish() call's argument, success or failure — unlike `.published`, which only grows
  // on success. Mirrors jest's `mock.calls` over a call that can throw.
  readonly publishAttempts: Envelope[] = [];
  readonly publishedTriggers: string[] = [];
  readonly subscriptions: RecordedSubscription[] = [];
  readonly dispatchedPushMessages: DispatchedPushMessage[] = [];
  // Counts every publish() invocation, success or failure — unlike `.published.length`, which
  // only grows on success. Mirrors jest's `toHaveBeenCalledTimes()` over a call that can throw.
  publishCallCount = 0;
  // Runs synchronously inside publish(), before recording — lets a spec assert an invariant that
  // must hold exactly when publish() is invoked (e.g. "no transaction is ambient right now"),
  // the same shape a jest `mockImplementation()` callback used to provide.
  onPublish?: (event: Envelope) => void | Promise<void>;
  private nextPublishError: unknown = NONE;
  private nextDispatchPushMessageError: unknown = NONE_DISPATCH;

  async publish(event: Envelope): Promise<void> {
    this.publishCallCount++;
    this.publishAttempts.push(event);
    if (this.onPublish) await this.onPublish(event);
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

  async dispatchPushMessage(subscriptionFullName: string, base64Data: string): Promise<void> {
    if (this.nextDispatchPushMessageError !== NONE_DISPATCH) {
      const err = this.nextDispatchPushMessageError;
      this.nextDispatchPushMessageError = NONE_DISPATCH;
      throw err;
    }
    this.dispatchedPushMessages.push({ subscriptionFullName, base64Data });
  }

  failNextDispatchPushMessage(error: unknown): void {
    this.nextDispatchPushMessageError = error;
  }

  clear(): void {
    this.published.length = 0;
    this.publishAttempts.length = 0;
    this.publishedTriggers.length = 0;
    this.subscriptions.length = 0;
    this.dispatchedPushMessages.length = 0;
    this.publishCallCount = 0;
    this.onPublish = undefined;
    this.nextPublishError = NONE;
    this.nextDispatchPushMessageError = NONE_DISPATCH;
  }
}
