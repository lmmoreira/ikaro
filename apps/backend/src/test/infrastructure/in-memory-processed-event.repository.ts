import { IProcessedEventRepository } from '../../contexts/loyalty/application/ports/processed-event-repository.port';

export class InMemoryProcessedEventRepository implements IProcessedEventRepository {
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
}
