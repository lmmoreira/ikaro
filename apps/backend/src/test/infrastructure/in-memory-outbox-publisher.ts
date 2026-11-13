import { Envelope } from '../../shared/domain/envelope';
import { IOutboxPublisher } from '../../shared/ports/outbox-publisher.port';
import type { InMemoryTransactionManager } from './in-memory-transaction-manager';

/**
 * Records every envelope a repository `save()` drains, so a spec can assert what was published.
 * Given the spec's `InMemoryTransactionManager`, it records an event only when the transaction
 * commits, the point at which the real outbox row becomes durable: a transaction that fails after
 * `save()` leaves nothing in `published`. Without one it records at once.
 */
export class InMemoryOutboxPublisher implements IOutboxPublisher {
  readonly published: Envelope[] = [];

  constructor(private readonly txManager?: InMemoryTransactionManager) {}

  async publish(event: Envelope): Promise<void> {
    const record = (): void => {
      this.published.push(event);
    };
    if (this.txManager) {
      await this.txManager.scheduleAfterCommit(record);
      return;
    }
    record();
  }
}
