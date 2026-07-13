import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Envelope } from '../../domain/envelope';
import { IOutboxRepository, OutboxRow } from '../../ports/outbox-repository.port';
import { getActiveEntityManager } from '../transaction-context';
import { OutboxEventEntity } from './outbox-event.entity';
import { OutboxPublishedOutsideTransactionError } from './outbox-published-outside-transaction.error';

interface OutboxInsertRow {
  id: string;
}

const INSERT_SQL = `
  INSERT INTO "shared"."outbox"
    ("id","dedup_key","tenant_id","event_name","payload","created_at")
  VALUES ($1,$2,$3,$4,$5,now())
  ON CONFLICT ("dedup_key") DO NOTHING
  RETURNING "id"
`;

const SELECT_UNPUBLISHED_BY_ID_SQL = `
  SELECT "id", "payload" FROM "shared"."outbox"
  WHERE "id" = $1 AND "published_at" IS NULL
`;

const MARK_PUBLISHED_SQL = `
  UPDATE "shared"."outbox" SET "published_at" = now()
  WHERE "id" = $1 AND "published_at" IS NULL
`;

const SWEEP_SELECT_SQL = `
  SELECT "id", "payload" FROM "shared"."outbox"
  WHERE "published_at" IS NULL
    AND "created_at" < now() - make_interval(secs => $1)
  ORDER BY "created_at"
  LIMIT $2
  FOR UPDATE SKIP LOCKED
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

// The only class in shared.outbox's stack that knows it's backed by raw SQL over TypeORM's
// query() escape hatch (repository.save() can't express ON CONFLICT DO NOTHING RETURNING or
// FOR UPDATE SKIP LOCKED) — OutboxPublisher and OutboxRelayService depend only on
// IOutboxRepository (shared/ports/outbox-repository.port.ts).
@Injectable()
export class TypeOrmOutboxRepository implements IOutboxRepository {
  constructor(
    @InjectRepository(OutboxEventEntity)
    private readonly repo: Repository<OutboxEventEntity>,
  ) {}

  async insert(event: Envelope, dedupKey: string): Promise<string | undefined> {
    // TD24-S03: every publish site (the 3 event-emitting aggregates' repositories, the 3 cron
    // jobs, the loyalty re-emit) now always runs inside txManager.run() — the standalone
    // fallback this used to have was a legitimate path only until that was true everywhere.
    const manager = getActiveEntityManager();
    if (!manager) {
      throw new OutboxPublishedOutsideTransactionError(event.eventName);
    }

    const params = [
      event.eventId,
      dedupKey,
      event.tenantId,
      event.eventName,
      JSON.stringify(event),
    ];

    const rows = (await manager.query(INSERT_SQL, params)) as OutboxInsertRow[];

    return rows[0]?.id;
  }

  async findUnpublishedById(id: string): Promise<OutboxRow | null> {
    const rows = (await this.repo.query(SELECT_UNPUBLISHED_BY_ID_SQL, [id])) as OutboxRow[];
    return rows[0] ?? null;
  }

  async markPublished(id: string, manager?: EntityManager): Promise<void> {
    const runner = manager ?? this.repo.manager;
    await runner.query(MARK_PUBLISHED_SQL, [id]);
  }

  async claimUnpublished(
    manager: EntityManager,
    graceSeconds: number,
    batchSize: number,
  ): Promise<OutboxRow[]> {
    return (await manager.query(SWEEP_SELECT_SQL, [graceSeconds, batchSize])) as OutboxRow[];
  }

  async runInTransaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.repo.manager.transaction(work);
  }

  async deleteOldPublished(retentionDays: number, batchSize: number): Promise<void> {
    await this.repo.query(GC_SQL, [retentionDays, batchSize]);
  }
}
