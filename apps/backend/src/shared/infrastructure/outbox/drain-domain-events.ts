import { AggregateRoot } from '../../domain/aggregate-root';
import { IOutboxPublisher } from '../../ports/outbox-publisher.port';

// Repository save() hook (TD24-S02, D6): drains an aggregate's pending domain events into the
// outbox, inside the same ambient transaction as the business write. Shared by the 3
// event-emitting aggregates' repositories (booking, tenant, staff) and their in-memory test
// doubles, so both can't drift from each other.
export async function drainDomainEvents(
  aggregate: AggregateRoot,
  outboxPublisher: IOutboxPublisher,
): Promise<void> {
  for (const event of aggregate.clearDomainEvents()) {
    await outboxPublisher.publish(event);
  }
}
