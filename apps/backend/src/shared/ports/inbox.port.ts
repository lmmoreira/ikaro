export const INBOX_REPOSITORY = Symbol('IInboxRepository');

export interface IInboxRepository {
  hasBeenProcessed(eventId: string, consumerName: string): Promise<boolean>;
  markProcessed(eventId: string, consumerName: string): Promise<void>;

  // Atomic claim protocol — for consumers whose side effect is external and unprotected by any
  // DB constraint (notification's actual dispatch happens before any DB write), where two
  // concurrent redeliveries of the same event could otherwise both pass a hasBeenProcessed check
  // before either writes markProcessed. tryClaim's INSERT ... ON CONFLICT DO NOTHING is atomic at
  // the database level: only one concurrent caller can ever get true for a given
  // (eventId, consumerName) pair. unclaim reverses a claim whose side effect then failed, so a
  // future redelivery can legitimately retry instead of silently skipping forever. Loyalty and
  // staff don't need this — their side effects are guarded by their own DB unique constraints, so
  // hasBeenProcessed/markProcessed is sufficient there.
  tryClaim(eventId: string, consumerName: string): Promise<boolean>;
  unclaim(eventId: string, consumerName: string): Promise<void>;

  // Retention GC (D8) — batched trickle-delete of rows older than retentionDays, called from the
  // same sweep tick as the outbox's own deleteOldPublished (OutboxRelayService). Returns the
  // number of rows deleted, for the GC observability log (TD24-S05).
  deleteOldProcessed(retentionDays: number, batchSize: number): Promise<number>;
}
