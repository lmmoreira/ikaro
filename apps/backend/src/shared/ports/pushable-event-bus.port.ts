export const PUSHABLE_EVENT_BUS = Symbol('IPushableEventBus');

// Separate from IEventBus on purpose: push-dispatch is Pub/Sub-push-specific (only meaningful
// when PUBSUB_CONSUMER_MODE=push), not a general event-bus capability every IEventBus
// implementation needs to support. Bound to the same singleton as EVENT_BUS via a token alias
// in EventBusModule (see event-bus.module.ts) — GcpPubSubEventBusAdapter implements both
// interfaces.
export interface IPushableEventBus {
  dispatchPushMessage(subscriptionFullName: string, base64Data: string): Promise<void>;
}
