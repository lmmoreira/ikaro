import { EntityManager } from 'typeorm';
import { Envelope } from '../domain/envelope';

export const OUTBOX_REPOSITORY = Symbol('IOutboxRepository');

export interface OutboxRow {
  id: string;
  payload: Record<string, unknown>;
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

  // Pass the transaction's manager when called from inside runInTransaction's callback (the
  // sweep), so the mark lands in the same transaction as the claim; omit it for the standalone
  // inline-dispatch path.
  markPublished(id: string, manager?: EntityManager): Promise<void>;

  // Claims a batch under FOR UPDATE SKIP LOCKED. Must be called with the manager runInTransaction
  // hands to its callback, so the row locks are held for the whole batch (see §Design).
  claimUnpublished(
    manager: EntityManager,
    graceSeconds: number,
    batchSize: number,
  ): Promise<OutboxRow[]>;

  runInTransaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T>;

  // The queue-lag signal (TD24-S05): how many rows are waiting, and how stale the oldest one is.
  countUnpublished(): Promise<UnpublishedBacklog>;

  // Returns the number of rows actually deleted, for the GC observability log (TD24-S05).
  deleteOldPublished(retentionDays: number, batchSize: number): Promise<number>;
}
