import { Envelope } from '../domain/envelope';

export { DomainEvent } from '../domain/domain-event';

export const EVENT_BUS = Symbol('IEventBus');

// Typed against Envelope (not DomainEvent) — publish()/subscribe() carry both DomainEvent (a
// fact) and Command (an idempotent instruction, see shared/domain/command.ts) over the same
// transport (e.g. OutboxRelayService relays either kind, honestly, without pretending one is the
// other). Callers that must never publish a Command directly (jobs, use cases) are kept off
// EVENT_BUS entirely via an import-boundary ESLint rule (TD24 D14), not by lying about this type —
// see td/TD24-OUTBOX-INBOX-PATTERN.md D14 and docs/ANTI_PATTERNS.md for why a type-level narrowing
// here was tried and reverted.
export interface IEventBus {
  publish(event: Envelope): Promise<void>;
  subscribe<T extends Envelope>(
    eventName: string,
    handler: (event: T) => Promise<void>,
    consumerName: string,
  ): void;
}
