import { AggregateRoot } from './aggregate-root';
import { DomainEvent } from './domain-event';

class OrderPlaced extends DomainEvent<{ orderId: string }> {
  readonly eventName = 'OrderPlaced';
  readonly eventVersion = 1;
  readonly data: { orderId: string };

  constructor(tenantId: string, correlationId: string, orderId: string) {
    super(tenantId, correlationId);
    this.data = { orderId };
  }
}

class Order extends AggregateRoot {
  place(tenantId: string, correlationId: string) {
    this.addDomainEvent(new OrderPlaced(tenantId, correlationId, 'order-1'));
  }
}

describe('AggregateRoot', () => {
  it('accumulates domain events', () => {
    const order = new Order();
    order.place('tenant-1', 'corr-1');
    expect(order.domainEvents).toHaveLength(1);
  });

  it('clearDomainEvents returns events and empties the list', () => {
    const order = new Order();
    order.place('tenant-1', 'corr-1');
    order.place('tenant-1', 'corr-2');

    const cleared = order.clearDomainEvents();

    expect(cleared).toHaveLength(2);
    expect(order.domainEvents).toHaveLength(0);
  });

  it('domainEvents getter returns a copy, not the internal array', () => {
    const order = new Order();
    order.place('tenant-1', 'corr-1');
    const events = order.domainEvents;
    events.pop();
    expect(order.domainEvents).toHaveLength(1);
  });

  it('domain event has all 7 envelope fields', () => {
    const order = new Order();
    order.place('tenant-abc', 'corr-xyz');
    const [event] = order.domainEvents as OrderPlaced[];

    expect(event!.eventId).toBeTruthy();
    expect(event!.tenantId).toBe('tenant-abc');
    expect(event!.correlationId).toBe('corr-xyz');
    expect(event!.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(event!.eventName).toBe('OrderPlaced');
    expect(event!.eventVersion).toBe(1);
    expect(event!.data.orderId).toBe('order-1');
  });
});
