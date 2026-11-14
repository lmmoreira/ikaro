import type { FeatureKey } from '@ikaro/validation';
import { Envelope } from '../domain/envelope';

export { DomainEvent } from '../domain/domain-event';

// What handlers inject: the gated bus (GatedEventBus), which applies SubscribeOptions.
export const EVENT_BUS = Symbol('IEventBus');

// The raw transport (the Pub/Sub adapter). Bound separately so the transport never depends on
// Billing's access port: a constructor dependency from the bus on TENANT_ACCESS_PORT would close
// the loop EVENT_BUS -> TENANT_ACCESS_PORT -> ... -> OUTBOX_PUBLISHER -> OutboxRelayService ->
// EVENT_BUS. The relay, TRIGGER_BUS and PUSHABLE_EVENT_BUS sit on the transport for that reason.
export const EVENT_BUS_TRANSPORT = Symbol('IEventBusTransport');

/**
 * Per-subscription delivery policy (M25-S21a, UC-125). Opt-in: a subscription that passes no
 * options, or only `skipWhenSuspended: false`, always runs. `skipWhenSuspended` skips (and logs)
 * the event while the event's tenant is not operational; `requires` skips it while the tenant is
 * not entitled to that feature. A skipped event is acknowledged and dropped, never replayed.
 */
export interface SubscribeOptions {
  skipWhenSuspended?: boolean;
  requires?: FeatureKey;
}

// Typed against Envelope (not DomainEvent) — publish()/subscribe() carry both DomainEvent (a
// fact) and Command (an idempotent instruction, see shared/domain/command.ts) over the same
// transport (e.g. OutboxRelayService relays either kind, honestly, without pretending one is the
// other). Callers that must never publish a Command directly (jobs, use cases) are kept off
// EVENT_BUS entirely via an import-boundary ESLint rule (TD24 D14), not by lying about this type —
// see docs/DOMAIN_EVENTS.md D14 and docs/ANTI_PATTERNS.md for why a type-level narrowing
// here was tried and reverted.
export interface IEventBus {
  publish(event: Envelope): Promise<void>;
  subscribe<T extends Envelope>(
    eventName: string,
    handler: (event: T) => Promise<void>,
    consumerName: string,
    options?: SubscribeOptions,
  ): void;
}
