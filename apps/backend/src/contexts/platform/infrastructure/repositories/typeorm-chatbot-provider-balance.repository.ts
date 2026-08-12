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

  /** Health-only partial upsert — touches last_success_at OR last_failure_at only, via the same
   * partial-upsert mechanism as saveBalance() above. Never touches remaining_usd/checked_at
   * (S08's balance columns). */
  async recordCallOutcome(
    provider: string,
    outcome: 'SUCCESS' | 'FAILURE',
    occurredAt: Date,
  ): Promise<void> {
    const entity = new ChatbotProviderBalanceEntity();
    entity.provider = provider;
    if (outcome === 'SUCCESS') {
      entity.lastSuccessAt = occurredAt;
    } else {
      entity.lastFailureAt = occurredAt;
    }
    await this.upsertEntity(entity);
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
