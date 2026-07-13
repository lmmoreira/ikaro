import { IInboxRepository } from '../../shared/ports/inbox.port';

export class InMemoryInboxRepository implements IInboxRepository {
  private readonly processed = new Set<string>();

  private key(eventId: string, consumerName: string): string {
    return `${eventId}:${consumerName}`;
  }

  async hasBeenProcessed(eventId: string, consumerName: string): Promise<boolean> {
    return this.processed.has(this.key(eventId, consumerName));
  }

  async markProcessed(eventId: string, consumerName: string): Promise<void> {
    this.processed.add(this.key(eventId, consumerName));
  }

  clear(): void {
    this.processed.clear();
  }

  // No-op: this double doesn't track processedAt. Retention GC is only exercised against the
  // real TypeOrmInboxRepository in integration tests, matching how the outbox side has no
  // in-memory double for deleteOldPublished() either.
  async deleteOldProcessed(): Promise<void> {}
}
