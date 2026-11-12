import { Envelope } from '../../shared/domain/envelope';
import { IOutboxPublisher } from '../../shared/ports/outbox-publisher.port';

/** Records every envelope a repository `save()` drains, so a spec can assert what was published. */
export class InMemoryOutboxPublisher implements IOutboxPublisher {
  readonly published: Envelope[] = [];

  async publish(event: Envelope): Promise<void> {
    this.published.push(event);
  }
}
