import { Envelope } from '../domain/envelope';

export const OUTBOX_REPOSITORY = Symbol('IOutboxRepository');

export interface OutboxRow {
  id: string;
  payload: Record<string, unknown>;
}

export interface OutboxClaim extends OutboxRow {
  leaseToken: string;
}

export interface UnpublishedBacklog {
  count: number;
  // Age of the oldest unpublished row, in seconds. null when count is 0 (nothing to measure).
  oldestAgeSeconds: number | null;
}

// Persistence port for shared.outbox — all SQL lives behind the TypeORM implementation
// (shared/infrastructure/outbox/typeorm-outbox.repository.ts). OutboxPublisher and
// OutboxRelayService depend on this port only; neither knows the outbox is backed by raw SQL.
export interface IOutboxRepository {
  // Joins the ambient transaction (getActiveEntityManager()) if one is active, else runs
  // standalone. Returns the inserted row's id, or undefined on a dedup_key conflict (no-op).
  insert(event: Envelope, dedupKey: string): Promise<string | undefined>;

  // The inline-dispatch path: this process's own just-inserted, still-unpublished row.
  findUnpublishedById(id: string): Promise<OutboxRow | null>;

  markPublished(id: string, leaseToken?: string): Promise<void>;

  // Must run inside ITransactionManager.run(). The TypeORM adapter joins the ambient context.
  claimUnpublished(
    graceSeconds: number,
    batchSize: number,
    leaseToken: string,
    leaseSeconds: number,
  ): Promise<OutboxClaim[]>;
  releaseClaim(id: string, leaseToken: string): Promise<void>;

  // The queue-lag signal (TD24-S05): how many rows are waiting, and how stale the oldest one is.
  countUnpublished(): Promise<UnpublishedBacklog>;

  // Must run inside ITransactionManager.run(). Returns the number actually deleted for GC logs.
  deleteOldPublished(retentionDays: number, batchSize: number): Promise<number>;
}
