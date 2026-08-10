import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { toDate } from '../../../../shared/utils/date';
import { IChatbotProviderBalanceRepository } from '../../application/ports/chatbot-provider-balance-repository.port';
import { ChatbotProviderBalance } from '../../domain/chatbot-provider-balance.aggregate';
import { ChatbotProviderBalanceEntity } from '../entities/chatbot-provider-balance.entity';

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

  /** Upsert-by-PK — `provider` is the primary key, so `save()` inserts or replaces the single row. */
  async save(balance: ChatbotProviderBalance): Promise<void> {
    const entity = this.toEntity(balance);
    const manager = getActiveEntityManager();
    if (manager) {
      await manager.save(ChatbotProviderBalanceEntity, entity);
    } else {
      await this.repo.save(entity);
    }
  }

  private toDomain(entity: ChatbotProviderBalanceEntity): ChatbotProviderBalance {
    return ChatbotProviderBalance.reconstitute({
      provider: entity.provider,
      remainingUsd: new Decimal(entity.remainingUsd),
      checkedAt: toDate(entity.checkedAt),
    });
  }

  private toEntity(balance: ChatbotProviderBalance): ChatbotProviderBalanceEntity {
    const entity = new ChatbotProviderBalanceEntity();
    entity.provider = balance.provider;
    entity.remainingUsd = balance.remainingUsd.toFixed(4);
    entity.checkedAt = balance.checkedAt;
    return entity;
  }
}
