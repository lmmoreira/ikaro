import { DomainEvent } from '../domain/domain-event';

export { DomainEvent };

export const EVENT_BUS = Symbol('IEventBus');

export interface IEventBus {
  publish(event: DomainEvent): Promise<void>;
}
