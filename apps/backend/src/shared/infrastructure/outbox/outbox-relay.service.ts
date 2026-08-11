import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Envelope } from '../../domain/envelope';
import { uuidv7 } from '../../domain/uuid-v7';
import { AppLogger } from '../../observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../ports/event-bus.port';
import { IInboxRepository, INBOX_REPOSITORY } from '../../ports/inbox.port';
import { IOutboxRepository, OUTBOX_REPOSITORY } from '../../ports/outbox-repository.port';
import { ITransactionManager, TRANSACTION_MANAGER } from '../../ports/transaction-manager.port';

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
  private readonly sweepBatchSize: number;
  private readonly sweepGraceSeconds: number;
  private readonly claimLeaseSeconds: number;
  private readonly outboxRetentionDays: number;
  private readonly inboxRetentionDays: number;

  constructor(
    @Inject(OUTBOX_REPOSITORY) private readonly outboxRepo: IOutboxRepository,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(INBOX_REPOSITORY) private readonly inboxRepo: IInboxRepository,
    private readonly config: ConfigService,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {
    this.sweepBatchSize = this.config.get<number>('OUTBOX_SWEEP_BATCH_SIZE', 100);
    this.sweepGraceSeconds = this.config.get<number>('OUTBOX_SWEEP_GRACE_SECONDS', 30);
    this.claimLeaseSeconds = this.config.get<number>('OUTBOX_CLAIM_LEASE_SECONDS', 120);
    this.outboxRetentionDays = this.config.get<number>('OUTBOX_RETENTION_DAYS', 14);
    this.inboxRetentionDays = this.config.get<number>('INBOX_RETENTION_DAYS', 14);
  }

  async relay(rowIds?: string[]): Promise<void> {
    if (rowIds !== undefined) {
      for (const id of rowIds) {
        await this.publishAndMarkOne(id);
      }
      return;
    }

    await this.sweep();
    await this.logBacklog();
    await this.gc();
  }

  // Inline-dispatch path: the row was just inserted by this same process, no contention — a
  // plain SELECT + conditional UPDATE is enough. If the sweep already claimed and published this
  // row concurrently (only possible once the grace window has elapsed), the SELECT finds nothing
  // and this is a no-op — never a double-publish-then-double-mark.
  private async publishAndMarkOne(id: string): Promise<void> {
    const row = await this.outboxRepo.findUnpublishedById(id);
    if (!row) return;

    const event = asStoredEvent(row.payload);
    try {
      await this.eventBus.publish(event);
      await this.txManager.run(() => this.outboxRepo.markPublished(id));
    } catch (err) {
      this.logger.error(
        '[outbox] relay publish failed — row stays unpublished, the sweep will retry',
        err instanceof Error ? err.stack : String(err),
        { outboxRowId: id, tenantId: event.tenantId, correlationId: event.correlationId },
      );
    }
  }

  // Sweep: each batch is leased in a short transaction, then published outside any transaction.
  // A second relay cannot claim an active lease; after each external publish, a second short
  // transaction conditionally marks that specific lease published. A crash after publishing can
  // therefore redeliver after the lease expires — intentional at-least-once delivery, with the
  // inbox consumer responsible for idempotency.
  private async sweep(): Promise<void> {
    let failureCount = 0;

    let more = true;
    while (more) {
      const leaseToken = uuidv7();
      const rows = await this.txManager.run(() =>
        this.outboxRepo.claimUnpublished(
          this.sweepGraceSeconds,
          this.sweepBatchSize,
          leaseToken,
          this.claimLeaseSeconds,
        ),
      );

      if (rows.length === 0) break;

      for (const row of rows) {
        const event = asStoredEvent(row.payload);
        try {
          await this.eventBus.publish(event);
          await this.txManager.run(() => this.outboxRepo.markPublished(row.id, row.leaseToken));
        } catch (err) {
          failureCount++;
          // Release promptly so the next tick can retry. If this short DB transaction fails, the
          // lease expiry is the recovery path and the original publish error is still reported.
          try {
            await this.txManager.run(() => this.outboxRepo.releaseClaim(row.id, row.leaseToken));
          } catch (releaseErr) {
            this.logger.error(
              '[outbox] failed to release a relay lease — expiry will recover it',
              releaseErr instanceof Error ? releaseErr.stack : String(releaseErr),
              { outboxRowId: row.id, tenantId: event.tenantId, correlationId: event.correlationId },
            );
          }
          this.logger.error(
            '[outbox] sweep publish failed — row stays unpublished for next tick',
            err instanceof Error ? err.stack : String(err),
            { outboxRowId: row.id, tenantId: event.tenantId, correlationId: event.correlationId },
          );
        }
      }

      more = rows.length === this.sweepBatchSize;
    }

    if (failureCount > 0) {
      this.logger.log('[outbox] sweep tick completed with publish failures', { failureCount });
    }
  }

  // Queue-lag signal (TD24-S05): how many rows are still waiting and how stale the oldest one
  // is. Logged once per tick, after the sweep — a cross-tenant aggregate (the sweep itself scans
  // the whole table in one pass, so this isn't scoped to any single tenant/correlation).
  private async logBacklog(): Promise<void> {
    const { count, oldestAgeSeconds } = await this.outboxRepo.countUnpublished();
    this.logger.log('[outbox] unpublished backlog', {
      unpublishedCount: count,
      oldestUnpublishedAgeSeconds: oldestAgeSeconds,
    });
  }

  // Retention GC: one batched trickle-delete per tick per table (D8) — never loops to empty. At
  // the default 5-minute sweep interval this is a few rows per tick, cheap for autovacuum, and
  // exactly what keeps both tables bounded without a separate cleanup job. Inbox GC (TD24-S04)
  // rides the same tick as the outbox's own GC rather than a separate schedule.
  private async gc(): Promise<void> {
    const { outboxDeleted, inboxDeleted } = await this.txManager.run(async () => ({
      outboxDeleted: await this.outboxRepo.deleteOldPublished(
        this.outboxRetentionDays,
        this.sweepBatchSize,
      ),
      inboxDeleted: await this.inboxRepo.deleteOldProcessed(
        this.inboxRetentionDays,
        this.sweepBatchSize,
      ),
    }));

    if (outboxDeleted > 0 || inboxDeleted > 0) {
      this.logger.log('[outbox] retention GC', { outboxDeleted, inboxDeleted });
    }
  }
}
