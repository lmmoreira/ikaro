import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { IProcessedEventRepository } from '../../application/ports/processed-event-repository.port';
import { ProcessedEventEntity } from '../entities/processed-event.entity';

@Injectable()
export class TypeOrmProcessedEventRepository implements IProcessedEventRepository {
  constructor(
    @InjectRepository(ProcessedEventEntity)
    private readonly repo: Repository<ProcessedEventEntity>,
  ) {}

  async hasBeenProcessed(eventId: string, consumerName: string): Promise<boolean> {
    const count = await this.repo.count({ where: { eventId, consumerName } });
    return count > 0;
  }

  async markProcessed(eventId: string, consumerName: string): Promise<void> {
    const manager = getActiveEntityManager();
    const entity = new ProcessedEventEntity();
    entity.eventId = eventId;
    entity.consumerName = consumerName;
    const conflictPaths: (keyof ProcessedEventEntity)[] = ['eventId', 'consumerName'];
    if (manager) {
      await manager.upsert(ProcessedEventEntity, entity, conflictPaths);
    } else {
      await this.repo.upsert(entity, conflictPaths);
    }
  }
}
