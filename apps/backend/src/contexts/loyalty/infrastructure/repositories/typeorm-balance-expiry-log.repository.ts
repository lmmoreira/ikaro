import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { IBalanceExpiryLogRepository } from '../../application/ports/balance-expiry-log-repository.port';
import { BalanceExpiryLogEntity } from '../entities/balance-expiry-log.entity';

@Injectable()
export class TypeOrmBalanceExpiryLogRepository implements IBalanceExpiryLogRepository {
  constructor(
    @InjectRepository(BalanceExpiryLogEntity)
    private readonly repo: Repository<BalanceExpiryLogEntity>,
  ) {}

  // On the active transaction's connection when there is one: a caller holding a lock must not
  // take a second pooled connection while it waits (pool exhaustion under load).
  async findProcessedEntryIds(entryIds: string[]): Promise<Set<string>> {
    if (entryIds.length === 0) return new Set();
    const manager = getActiveEntityManager();
    const where = { entryId: In(entryIds) };
    const rows = manager
      ? await manager.find(BalanceExpiryLogEntity, { where })
      : await this.repo.find({ where });
    return new Set(rows.map((row) => row.entryId));
  }

  // ON CONFLICT DO NOTHING: an entry another run already marked keeps its original processed_at.
  async markProcessedMany(entryIds: string[]): Promise<void> {
    if (entryIds.length === 0) return;
    const executor = getActiveEntityManager() ?? this.repo.manager;
    await executor
      .createQueryBuilder()
      .insert()
      .into(BalanceExpiryLogEntity)
      .values(entryIds.map((entryId) => ({ entryId })))
      .orIgnore()
      .execute();
  }
}
