import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { DomainEvent } from '../../domain/domain-event';
import { AppLogger } from '../../observability/app-logger';
import { GcpPubSubEventBusAdapter } from '../gcp-pubsub-event-bus.adapter';
import { OutboxEventEntity } from './outbox-event.entity';

interface OutboxRowForDispatch {
  id: string;
  payload: Record<string, unknown>;
}

// The stored payload is the verbatim envelope JSON.stringify()'d from a real DomainEvent by
// OutboxEventBus.publish() — this reinterprets it back for GcpPubSubEventBusAdapter.publish(),
// which only reads .eventName (topic routing) and re-serializes the whole object. Structurally
// identical to the original event; not a real DomainEvent instance (no aggregate methods), which
// is fine since none are called on the relay path. Parameter typed `unknown` (not
// Record<string, unknown>) so the single assertion below matches the adapter's own
// JSON.parse(...) . as DomainEvent precedent in dispatch() — no double-cast through unknown.
function asStoredEvent(payload: unknown): DomainEvent {
  return payload as DomainEvent;
}

const SWEEP_SELECT_SQL = `
  SELECT "id", "payload" FROM "shared"."outbox"
  WHERE "published_at" IS NULL
    AND "created_at" < now() - make_interval(secs => $1)
  ORDER BY "created_at"
  LIMIT $2
  FOR UPDATE SKIP LOCKED
`;

const MARK_PUBLISHED_SQL = `
  UPDATE "shared"."outbox" SET "published_at" = now()
  WHERE "id" = $1 AND "published_at" IS NULL
`;

const SELECT_UNPUBLISHED_BY_ID_SQL = `
  SELECT "id", "payload" FROM "shared"."outbox"
  WHERE "id" = $1 AND "published_at" IS NULL
`;

const GC_SQL = `
  DELETE FROM "shared"."outbox"
  WHERE "id" IN (
    SELECT "id" FROM "shared"."outbox"
    WHERE "published_at" IS NOT NULL
      AND "published_at" < now() - make_interval(days => $1)
    LIMIT $2
  )
`;

// Single publication path used by both the inline dispatch (OutboxEventBus, one row) and the
// scheduled sweep (OutboxRelayTriggerHandler, no rowIds — full grace-window batch + retention GC
// in the same tick). See td/TD24-OUTBOX-INBOX-PATTERN.md §Design.
@Injectable()
export class OutboxRelayService {
  private readonly logger = new AppLogger(OutboxRelayService.name);

  constructor(
    @InjectRepository(OutboxEventEntity)
    private readonly repo: Repository<OutboxEventEntity>,
    private readonly innerBus: GcpPubSubEventBusAdapter,
    private readonly config: ConfigService,
  ) {}

  async relay(rowIds?: string[]): Promise<void> {
    if (rowIds && rowIds.length > 0) {
      for (const id of rowIds) {
        await this.publishAndMarkOne(id);
      }
      return;
    }

    await this.sweep();
    await this.gc();
  }

  // Inline-dispatch path: the row was just inserted by this same process, no contention — a
  // plain SELECT + conditional UPDATE is enough. If the sweep already claimed and published this
  // row concurrently (only possible once the grace window has elapsed), the SELECT finds nothing
  // and this is a no-op — never a double-publish-then-double-mark.
  private async publishAndMarkOne(id: string): Promise<void> {
    try {
      const rows = (await this.repo.query(SELECT_UNPUBLISHED_BY_ID_SQL, [
        id,
      ])) as OutboxRowForDispatch[];
      if (rows.length === 0) return;

      await this.innerBus.publish(asStoredEvent(rows[0].payload));
      await this.repo.query(MARK_PUBLISHED_SQL, [id]);
    } catch (err) {
      this.logger.error(
        '[outbox] relay publish failed — row stays unpublished, the sweep will retry',
        err instanceof Error ? err.stack : String(err),
        { outboxRowId: id },
      );
    }
  }

  // Sweep: SELECT ... FOR UPDATE SKIP LOCKED must hold its row locks across the publish attempts
  // for the whole batch, or two concurrent sweeps could both select the same rows before either
  // marks them published. The transaction is deliberately held open across the Pub/Sub network
  // calls for this reason — accepted at this scale (small batches, low-latency publishes).
  private async sweep(): Promise<void> {
    const batchSize = this.config.get<number>('OUTBOX_SWEEP_BATCH_SIZE', 100);
    const graceSeconds = this.config.get<number>('OUTBOX_SWEEP_GRACE_SECONDS', 30);

    let more = true;
    while (more) {
      more = await this.repo.manager.transaction(async (manager: EntityManager) => {
        const rows = (await manager.query(SWEEP_SELECT_SQL, [
          graceSeconds,
          batchSize,
        ])) as OutboxRowForDispatch[];

        if (rows.length === 0) return false;

        for (const row of rows) {
          try {
            await this.innerBus.publish(asStoredEvent(row.payload));
            await manager.query(MARK_PUBLISHED_SQL, [row.id]);
          } catch (err) {
            // Swallowed: this row stays unpublished (published_at still NULL) and is retried
            // next tick. The transaction still commits, releasing the SKIP LOCKED lock on it.
            this.logger.error(
              '[outbox] sweep publish failed — row stays unpublished for next tick',
              err instanceof Error ? err.stack : String(err),
              { outboxRowId: row.id },
            );
          }
        }

        return rows.length === batchSize;
      });
    }
  }

  // Retention GC: one batched trickle-delete per tick (D8) — never loops to empty. At the
  // default 5-minute sweep interval this is a few rows per tick, cheap for autovacuum, and
  // exactly what keeps the outbox table bounded without a separate cleanup job.
  private async gc(): Promise<void> {
    const retentionDays = this.config.get<number>('OUTBOX_RETENTION_DAYS', 14);
    const batchSize = this.config.get<number>('OUTBOX_SWEEP_BATCH_SIZE', 100);
    await this.repo.query(GC_SQL, [retentionDays, batchSize]);
  }
}
