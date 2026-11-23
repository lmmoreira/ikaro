import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { IProviderEventRepository } from '../../application/ports/provider-event-repository.port';
import type { BillingProvider } from '../../domain/billing-account.aggregate';
import type { ProviderEvent } from '../../domain/provider-event';
import { ProviderEventEntity } from '../entities/provider-event.entity';

// `ON CONFLICT DO NOTHING ... RETURNING` yields a row only for the call that inserted it, so the
// replay (or the loser of a concurrent pair) reads no row and is a no-op, with no exception.
const INSERT_IF_ABSENT_SQL = `
  INSERT INTO "billing"."provider_events"
    ("provider", "event_id", "tenant_id", "event_type", "received_at", "processed_at")
  VALUES ($1, $2, $3, $4, $5, $6)
  ON CONFLICT ("provider", "event_id") DO NOTHING
  RETURNING "event_id"
`;

// Postgres DELETE has no LIMIT, so the batch is chosen by the inner select, which the
// `received_at` index serves in order. The result is read from `RETURNING`, not the driver count.
export const DELETE_OLDER_THAN_BATCH_SQL = `
  DELETE FROM "billing"."provider_events"
  WHERE ("provider", "event_id") IN (
    SELECT "provider", "event_id" FROM "billing"."provider_events"
    WHERE "received_at" < $1
    ORDER BY "received_at"
    LIMIT $2
  )
  RETURNING "event_id"
`;

@Injectable()
export class TypeOrmProviderEventRepository implements IProviderEventRepository {
  constructor(
    @InjectRepository(ProviderEventEntity)
    private readonly repo: Repository<ProviderEventEntity>,
  ) {}

  async exists(provider: BillingProvider, eventId: string): Promise<boolean> {
    const manager = getActiveEntityManager() ?? this.repo.manager;
    return manager.exists(ProviderEventEntity, { where: { provider, eventId } });
  }

  async existsProcessedAfter(provider: BillingProvider, since: Date): Promise<boolean> {
    const manager = getActiveEntityManager() ?? this.repo.manager;
    // `processed_at` is NOT NULL: an inbox row only exists once its delivery was processed.
    return manager.exists(ProviderEventEntity, {
      where: { provider, receivedAt: MoreThan(since) },
    });
  }

  async insertIfAbsent(event: ProviderEvent): Promise<boolean> {
    // Joins the caller's transaction: the row commits with the local change and the outbox rows.
    const manager = getActiveEntityManager() ?? this.repo.manager;
    const result = (await manager.query(INSERT_IF_ABSENT_SQL, [
      event.provider,
      event.eventId,
      event.tenantId,
      event.eventType,
      event.receivedAt,
      event.processedAt,
    ])) as { event_id: string }[] | [{ event_id: string }[], number];
    // TypeORM's INSERT ... RETURNING may be [rows, rowCount] (see the outbox claim).
    const rows = (Array.isArray(result[0]) ? result[0] : result) as { event_id: string }[];
    return rows.length === 1;
  }

  async deleteOlderThanBatch(cutoff: Date, limit: number): Promise<number> {
    const manager = getActiveEntityManager() ?? this.repo.manager;
    const result = (await manager.query(DELETE_OLDER_THAN_BATCH_SQL, [cutoff, limit])) as
      { event_id: string }[] | [{ event_id: string }[], number];
    // TypeORM's DELETE ... RETURNING may be [rows, rowCount] (see insertIfAbsent).
    const rows = (Array.isArray(result[0]) ? result[0] : result) as { event_id: string }[];
    return rows.length;
  }
}
