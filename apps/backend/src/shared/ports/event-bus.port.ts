import { DomainEvent } from '../domain/domain-event';
import { Envelope } from '../domain/envelope';

export { DomainEvent };

export const EVENT_BUS = Symbol('IEventBus');

// Typed against Envelope (not DomainEvent) — publish()/subscribe() carry both DomainEvent (a
// fact) and Command (an idempotent instruction, see shared/domain/command.ts) over the same
// transport. Neither needs to know about the other's existence.
export interface IEventBus {
  publish(event: Envelope): Promise<void>;
  subscribe<T extends Envelope>(
    eventName: string,
    handler: (event: T) => Promise<void>,
    consumerName: string,
  ): void;
}
