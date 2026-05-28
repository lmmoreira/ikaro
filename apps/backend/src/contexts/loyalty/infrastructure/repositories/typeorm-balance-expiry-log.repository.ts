import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { IBalanceExpiryLogRepository } from '../../application/ports/balance-expiry-log-repository.port';
import { BalanceExpiryLogEntity } from '../entities/balance-expiry-log.entity';

@Injectable()
export class TypeOrmBalanceExpiryLogRepository implements IBalanceExpiryLogRepository {
  constructor(
    @InjectRepository(BalanceExpiryLogEntity)
    private readonly repo: Repository<BalanceExpiryLogEntity>,
  ) {}

  async hasBeenProcessed(entryId: string): Promise<boolean> {
    const count = await this.repo.count({ where: { entryId } });
    return count > 0;
  }

  async markProcessed(entryId: string): Promise<void> {
    const manager = getActiveEntityManager();
    const entity = new BalanceExpiryLogEntity();
    entity.entryId = entryId;
    const conflictPaths: (keyof BalanceExpiryLogEntity)[] = ['entryId'];
    if (manager) {
      await manager.upsert(BalanceExpiryLogEntity, entity, conflictPaths);
    } else {
      await this.repo.upsert(entity, conflictPaths);
    }
  }
}
