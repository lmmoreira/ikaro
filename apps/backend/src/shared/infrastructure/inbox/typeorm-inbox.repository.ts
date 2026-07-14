import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getActiveEntityManager } from '../transaction-context';
import { IInboxRepository } from '../../ports/inbox.port';
import { InboxRecordEntity } from './inbox-record.entity';

const GC_SQL = `
  DELETE FROM "shared"."inbox"
  WHERE ("event_id", "consumer_name") IN (
    SELECT "event_id", "consumer_name" FROM "shared"."inbox"
    WHERE "processed_at" < now() - make_interval(days => $1)
    LIMIT $2
  )
  RETURNING "event_id"
`;

// Same shape as TypeOrmOutboxRepository.insert()'s INSERT_SQL — an empty RETURNING result means
// the (event_id, consumer_name) pair already existed, i.e. someone else won the claim.
const TRY_CLAIM_SQL = `
  INSERT INTO "shared"."inbox" ("event_id", "consumer_name", "processed_at")
  VALUES ($1, $2, now())
  ON CONFLICT ("event_id", "consumer_name") DO NOTHING
  RETURNING "event_id"
`;

const UNCLAIM_SQL = `
  DELETE FROM "shared"."inbox" WHERE "event_id" = $1 AND "consumer_name" = $2
`;

@Injectable()
export class TypeOrmInboxRepository implements IInboxRepository {
  constructor(
    @InjectRepository(InboxRecordEntity)
    private readonly repo: Repository<InboxRecordEntity>,
  ) {}

  async hasBeenProcessed(eventId: string, consumerName: string): Promise<boolean> {
    const count = await this.repo.count({ where: { eventId, consumerName } });
    return count > 0;
  }

  async markProcessed(eventId: string, consumerName: string): Promise<void> {
    const manager = getActiveEntityManager();
    const entity = new InboxRecordEntity();
    entity.eventId = eventId;
    entity.consumerName = consumerName;
    const conflictPaths: (keyof InboxRecordEntity)[] = ['eventId', 'consumerName'];
    if (manager) {
      await manager.upsert(InboxRecordEntity, entity, conflictPaths);
    } else {
      await this.repo.upsert(entity, conflictPaths);
    }
  }

  async tryClaim(eventId: string, consumerName: string): Promise<boolean> {
    const rows = (await this.repo.query(TRY_CLAIM_SQL, [eventId, consumerName])) as unknown[];
    return rows.length > 0;
  }

  async unclaim(eventId: string, consumerName: string): Promise<void> {
    await this.repo.query(UNCLAIM_SQL, [eventId, consumerName]);
  }

  async deleteOldProcessed(retentionDays: number, batchSize: number): Promise<number> {
    const rows = (await this.repo.query(GC_SQL, [retentionDays, batchSize])) as unknown[];
    return rows.length;
  }
}
