export const INBOX_REPOSITORY = Symbol('IInboxRepository');

export interface IInboxRepository {
  hasBeenProcessed(eventId: string, consumerName: string): Promise<boolean>;
  markProcessed(eventId: string, consumerName: string): Promise<void>;

  // Retention GC (D8) — batched trickle-delete of rows older than retentionDays, called from the
  // same sweep tick as the outbox's own deleteOldPublished (OutboxRelayService).
  deleteOldProcessed(retentionDays: number, batchSize: number): Promise<void>;
}
