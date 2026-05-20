import { DomainEvent } from '../domain/domain-event';

export { DomainEvent };

export const EVENT_BUS = Symbol('IEventBus');

export interface IEventBus {
  publish(event: DomainEvent): Promise<void>;
  subscribe<T extends DomainEvent>(
    eventName: string,
    handler: (event: T) => Promise<void>,
    consumerName: string,
  ): void;
}
