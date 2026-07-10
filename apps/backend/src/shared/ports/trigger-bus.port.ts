export const TRIGGER_BUS = Symbol('ITriggerBus');

// Separate from IEventBus on purpose, mirroring IPushableEventBus (pushable-event-bus.port.ts):
// a cron tick carries no tenantId and no business fact, only "run now". Routing it through the
// DomainEvent-typed publish()/subscribe() pair would let a sentinel/fake tenant leak into
// logging, OTel span attributes, and DLQ payloads that assume every DomainEvent carries a real
// tenant (§2 invariant #3). Bound to the same singleton as EVENT_BUS via a token alias in
// EventBusModule (see event-bus.module.ts) — GcpPubSubEventBusAdapter implements both interfaces.
export interface ITriggerBus {
  registerTrigger(name: string, handler: () => Promise<void>, consumerName: string): void;
  publishTrigger(name: string): Promise<void>;
}
