import { Envelope } from '../domain/envelope';

export const OUTBOX_PUBLISHER = Symbol('IOutboxPublisher');

// Publish-only, deliberately not IEventBus: the outbox has nothing to do with subscribing,
// triggers, or push dispatch — those stay on IEventBus/ITriggerBus/IPushableEventBus, delegating
// straight to the real Pub/Sub adapter. This port's only job is durably recording an envelope in
// shared.outbox inside the caller's transaction (see shared/infrastructure/outbox/outbox-publisher.ts).
export interface IOutboxPublisher {
  publish(event: Envelope): Promise<void>;
}
