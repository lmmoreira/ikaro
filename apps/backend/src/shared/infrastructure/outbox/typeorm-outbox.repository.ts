import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Envelope } from '../../domain/envelope';
import {
  IOutboxRepository,
  OutboxClaim,
  UnpublishedBacklog,
} from '../../ports/outbox-repository.port';
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

const CLAIM_UNPUBLISHED_BY_ID_SQL = `
  UPDATE "shared"."outbox"
  SET "lease_token" = $2::uuid,
      "lease_expires_at" = now() + make_interval(secs => $3)
  WHERE "id" = $1
    AND "published_at" IS NULL
    AND ("lease_expires_at" IS NULL OR "lease_expires_at" < now())
  RETURNING "id", "payload", "lease_token" AS "leaseToken"
`;

const MARK_PUBLISHED_SQL = `UPDATE "shared"."outbox" SET "published_at" = now(), "lease_token" = NULL, "lease_expires_at" = NULL WHERE "id" = $1 AND "published_at" IS NULL AND (($2::uuid IS NULL AND "lease_token" IS NULL) OR "lease_token" = $2::uuid)`;

const CLAIM_UNPUBLISHED_SQL = `
  WITH candidates AS (
    SELECT "id" FROM "shared"."outbox"
    WHERE "published_at" IS NULL AND "created_at" < now() - make_interval(secs => $1)
      AND ("lease_expires_at" IS NULL OR "lease_expires_at" < now())
    ORDER BY "created_at" LIMIT $2 FOR UPDATE SKIP LOCKED
  )
  UPDATE "shared"."outbox" AS outbox SET "lease_token" = $3::uuid,
    "lease_expires_at" = now() + make_interval(secs => $4)
  FROM candidates WHERE outbox."id" = candidates."id"
  RETURNING outbox."id", outbox."payload", outbox."lease_token" AS "leaseToken"
`;
const RELEASE_CLAIM_SQL = `UPDATE "shared"."outbox" SET "lease_token" = NULL, "lease_expires_at" = NULL WHERE "id" = $1 AND "lease_token" = $2::uuid AND "published_at" IS NULL`;

const GC_SQL = `
  DELETE FROM "shared"."outbox"
  WHERE "id" IN (
    SELECT "id" FROM "shared"."outbox"
    WHERE "published_at" IS NOT NULL
      AND "published_at" < now() - make_interval(days => $1)
    LIMIT $2
  )
  RETURNING "id"
`;

// TD24-S05: the queue-lag signal — how many rows are waiting, and how stale the oldest one is.
const COUNT_UNPUBLISHED_SQL = `
  SELECT
    COUNT(*)::int AS "count",
    EXTRACT(EPOCH FROM (now() - MIN("created_at")))::int AS "oldestAgeSeconds"
  FROM "shared"."outbox"
  WHERE "published_at" IS NULL
`;

interface CountUnpublishedRow {
  count: number;
  oldestAgeSeconds: number | null;
}

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
    // TD24-S03: every publish site (the event-emitting aggregates' repositories, the cron
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

  async claimUnpublishedById(
    id: string,
    leaseToken: string,
    leaseSeconds: number,
  ): Promise<OutboxClaim | null> {
    const manager = getActiveEntityManager();
    if (!manager) {
      throw new Error('Outbox inline claims must run inside ITransactionManager.run().');
    }
    const result = (await manager.query(CLAIM_UNPUBLISHED_BY_ID_SQL, [
      id,
      leaseToken,
      leaseSeconds,
    ])) as OutboxClaim[] | [OutboxClaim[], number];
    // Like the batch claim, TypeORM's transactional UPDATE ... RETURNING may be [rows, rowCount].
    // Normalize this driver-specific shape before exposing the port result to the relay.
    const rows = (Array.isArray(result[0]) ? result[0] : result) as OutboxClaim[];
    return rows[0] ?? null;
  }

  async markPublished(id: string, leaseToken?: string): Promise<void> {
    const manager = getActiveEntityManager() ?? this.repo.manager;
    await manager.query(MARK_PUBLISHED_SQL, [id, leaseToken ?? null]);
  }

  async claimUnpublished(
    graceSeconds: number,
    batchSize: number,
    leaseToken: string,
    leaseSeconds: number,
  ): Promise<OutboxClaim[]> {
    const manager = getActiveEntityManager();
    if (!manager) {
      throw new Error('Outbox claims must run inside ITransactionManager.run().');
    }
    const result = (await manager.query(CLAIM_UNPUBLISHED_SQL, [
      graceSeconds,
      batchSize,
      leaseToken,
      leaseSeconds,
    ])) as OutboxClaim[] | [OutboxClaim[], number];
    // PostgreSQL's TypeORM transaction manager can return UPDATE ... RETURNING as
    // [rows, rowCount], while Repository.query() returns rows directly. Normalize at the adapter
    // boundary so the port never leaks driver-specific result shapes to the relay.
    if (Array.isArray(result[0])) return result[0] as OutboxClaim[];
    return result as OutboxClaim[];
  }

  async releaseClaim(id: string, leaseToken: string): Promise<void> {
    const manager = getActiveEntityManager();
    if (!manager)
      throw new Error('Outbox claim release must run inside ITransactionManager.run().');
    await manager.query(RELEASE_CLAIM_SQL, [id, leaseToken]);
  }

  async countUnpublished(): Promise<UnpublishedBacklog> {
    const rows = (await this.repo.query(COUNT_UNPUBLISHED_SQL)) as CountUnpublishedRow[];
    return rows[0] ?? { count: 0, oldestAgeSeconds: null };
  }

  async deleteOldPublished(retentionDays: number, batchSize: number): Promise<number> {
    const manager = getActiveEntityManager();
    if (!manager) throw new Error('Outbox retention GC must run inside ITransactionManager.run().');
    const rows = (await manager.query(GC_SQL, [retentionDays, batchSize])) as unknown[];
    return rows.length;
  }
}
