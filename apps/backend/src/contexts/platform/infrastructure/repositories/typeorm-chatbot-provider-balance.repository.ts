import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { toDate } from '../../../../shared/utils/date';
import { IChatbotProviderBalanceRepository } from '../../application/ports/chatbot-provider-balance-repository.port';
import { ChatbotProviderBalance } from '../../domain/chatbot-provider-balance.aggregate';
import { ChatbotProviderBalanceEntity } from '../entities/chatbot-provider-balance.entity';

const CONFLICT_PATHS: (keyof ChatbotProviderBalanceEntity)[] = ['provider'];

@Injectable()
export class TypeOrmChatbotProviderBalanceRepository implements IChatbotProviderBalanceRepository {
  constructor(
    @InjectRepository(ChatbotProviderBalanceEntity)
    private readonly repo: Repository<ChatbotProviderBalanceEntity>,
  ) {}

  async findByProvider(provider: string): Promise<ChatbotProviderBalance | null> {
    const entity = await this.repo.findOne({ where: { provider } });
    return entity ? this.toDomain(entity) : null;
  }

  /** Balance-only partial upsert — touches remaining_usd/checked_at only. The entity built here
   * deliberately never sets lastSuccessAt/lastFailureAt, so TypeORM's upsert() structurally
   * excludes them from its DO UPDATE SET clause (only columns actually present — not undefined —
   * on the passed entity are included, verified against EntityManager.upsert()'s own source) —
   * never touching S05/S06's health columns, not just by convention. */
  async saveBalance(balance: ChatbotProviderBalance): Promise<void> {
    const entity = new ChatbotProviderBalanceEntity();
    entity.provider = balance.provider;
    entity.remainingUsd = balance.remainingUsd!.toFixed(4);
    entity.checkedAt = balance.checkedAt!;
    await this.upsertEntity(entity);
  }

  /** Health-only partial upsert — touches last_success_at OR last_failure_at only, never
   * remaining_usd/checked_at (S08's balance columns). Guards the update with `orUpdate()`'s
   * `overwriteCondition` (TypeORM's own conflict-condition API, not a hand-rolled raw
   * `ON CONFLICT` string) so the incoming timestamp only applies when it's actually newer than
   * (or the column has never been set): two concurrent calls (e.g. a slow FAILURE write from an
   * older request landing after a newer SUCCESS write) must never let the older timestamp
   * clobber the newer one — isHealthy()'s cooldown logic depends on
   * last_success_at/last_failure_at reflecting the true most-recent outcome, not just the
   * most-recently-applied write. */
  async recordCallOutcome(
    provider: string,
    outcome: 'SUCCESS' | 'FAILURE',
    occurredAt: Date,
  ): Promise<void> {
    const manager = getActiveEntityManager() ?? this.repo.manager;
    const qb = manager.createQueryBuilder().insert().into(ChatbotProviderBalanceEntity);
    if (outcome === 'SUCCESS') {
      await qb
        .values({ provider, lastSuccessAt: occurredAt })
        .orUpdate(['last_success_at'], ['provider'], {
          overwriteCondition: {
            where:
              'chatbot_provider_balance.last_success_at IS NULL OR ' +
              'chatbot_provider_balance.last_success_at < EXCLUDED.last_success_at',
          },
        })
        .execute();
    } else {
      await qb
        .values({ provider, lastFailureAt: occurredAt })
        .orUpdate(['last_failure_at'], ['provider'], {
          overwriteCondition: {
            where:
              'chatbot_provider_balance.last_failure_at IS NULL OR ' +
              'chatbot_provider_balance.last_failure_at < EXCLUDED.last_failure_at',
          },
        })
        .execute();
    }
  }

  private async upsertEntity(entity: ChatbotProviderBalanceEntity): Promise<void> {
    const manager = getActiveEntityManager();
    if (manager) {
      await manager.upsert(ChatbotProviderBalanceEntity, entity, CONFLICT_PATHS);
    } else {
      await this.repo.upsert(entity, CONFLICT_PATHS);
    }
  }

  private toDomain(entity: ChatbotProviderBalanceEntity): ChatbotProviderBalance {
    return ChatbotProviderBalance.reconstitute({
      provider: entity.provider,
      remainingUsd: entity.remainingUsd != null ? new Decimal(entity.remainingUsd) : null,
      checkedAt: entity.checkedAt != null ? toDate(entity.checkedAt) : null,
      lastSuccessAt: entity.lastSuccessAt != null ? toDate(entity.lastSuccessAt) : null,
      lastFailureAt: entity.lastFailureAt != null ? toDate(entity.lastFailureAt) : null,
    });
  }
}
