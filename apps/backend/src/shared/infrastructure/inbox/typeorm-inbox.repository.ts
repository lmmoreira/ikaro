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

  async deleteOldProcessed(retentionDays: number, batchSize: number): Promise<void> {
    await this.repo.query(GC_SQL, [retentionDays, batchSize]);
  }
}
