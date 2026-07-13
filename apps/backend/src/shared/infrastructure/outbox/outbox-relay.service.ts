import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from 'typeorm';
import { Envelope } from '../../domain/envelope';
import { AppLogger } from '../../observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../ports/event-bus.port';
import { IInboxRepository, INBOX_REPOSITORY } from '../../ports/inbox.port';
import { IOutboxRepository, OUTBOX_REPOSITORY } from '../../ports/outbox-repository.port';

// The stored payload is the verbatim envelope JSON.stringify()'d from a real DomainEvent or
// Command by OutboxPublisher.publish() — this reinterprets it back for
// GcpPubSubEventBusAdapter.publish(), which only reads .eventName (topic routing) and
// re-serializes the whole object. Structurally identical to the original; not a real class
// instance (no aggregate methods, no Command.dedupKey type guard), which is fine since neither
// is used on the relay path. Cast to Envelope, honestly — the relay handles both DomainEvent and
// Command payloads generically and never needs to distinguish them (dedup already happened at
// insert time); labeling this DomainEvent would be a lie for a relayed Command's payload.
// Parameter typed `unknown` (not Record<string, unknown>) so the single assertion below matches
// the adapter's own JSON.parse(...) as Envelope precedent in dispatch() — no double-cast through
// unknown.
function asStoredEvent(payload: unknown): Envelope {
  return payload as Envelope;
}

// Single publication path used by both the inline dispatch (OutboxPublisher, one row) and the
// scheduled sweep (OutboxRelayTriggerHandler, no rowIds — full grace-window batch + retention GC
// in the same tick). See td/TD24-OUTBOX-INBOX-PATTERN.md §Design. No SQL here — all persistence
// lives behind IOutboxRepository (see TypeOrmOutboxRepository); this class only orchestrates
// which rows get claimed/published/marked and when.
@Injectable()
export class OutboxRelayService {
  private readonly logger = new AppLogger(OutboxRelayService.name);

  constructor(
    @Inject(OUTBOX_REPOSITORY) private readonly outboxRepo: IOutboxRepository,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(INBOX_REPOSITORY) private readonly inboxRepo: IInboxRepository,
    private readonly config: ConfigService,
  ) {}

  async relay(rowIds?: string[]): Promise<void> {
    if (rowIds !== undefined) {
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
      const row = await this.outboxRepo.findUnpublishedById(id);
      if (!row) return;

      await this.eventBus.publish(asStoredEvent(row.payload));
      await this.outboxRepo.markPublished(id);
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
      more = await this.outboxRepo.runInTransaction(async (manager: EntityManager) => {
        const rows = await this.outboxRepo.claimUnpublished(manager, graceSeconds, batchSize);

        if (rows.length === 0) return false;

        for (const row of rows) {
          try {
            await this.eventBus.publish(asStoredEvent(row.payload));
            await this.outboxRepo.markPublished(row.id, manager);
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

  // Retention GC: one batched trickle-delete per tick per table (D8) — never loops to empty. At
  // the default 5-minute sweep interval this is a few rows per tick, cheap for autovacuum, and
  // exactly what keeps both tables bounded without a separate cleanup job. Inbox GC (TD24-S04)
  // rides the same tick as the outbox's own GC rather than a separate schedule.
  private async gc(): Promise<void> {
    const batchSize = this.config.get<number>('OUTBOX_SWEEP_BATCH_SIZE', 100);

    const outboxRetentionDays = this.config.get<number>('OUTBOX_RETENTION_DAYS', 14);
    await this.outboxRepo.deleteOldPublished(outboxRetentionDays, batchSize);

    const inboxRetentionDays = this.config.get<number>('INBOX_RETENTION_DAYS', 14);
    await this.inboxRepo.deleteOldProcessed(inboxRetentionDays, batchSize);
  }
}
