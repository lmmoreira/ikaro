import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Decimal } from 'decimal.js';
import { Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { toDate } from '../../../../shared/utils/date';
import { IChatbotMessageRepository } from '../../application/ports/chatbot-message-repository.port';
import { ChatbotMessage, ChatbotMessageRole } from '../../domain/chatbot-message.aggregate';
import { ChatbotMessageEntity } from '../entities/chatbot-message.entity';

@Injectable()
export class TypeOrmChatbotMessageRepository implements IChatbotMessageRepository {
  constructor(
    @InjectRepository(ChatbotMessageEntity)
    private readonly repo: Repository<ChatbotMessageEntity>,
  ) {}

  async findById(id: string, tenantId: string): Promise<ChatbotMessage | null> {
    const entity = await this.repo.findOne({ where: { id, tenantId } });
    return entity ? this.toDomain(entity) : null;
  }

  async findBySession(sessionId: string, tenantId: string): Promise<ChatbotMessage[]> {
    const entities = await this.repo.find({
      where: { sessionId, tenantId },
      order: { createdAt: 'ASC' },
    });
    return entities.map((entity) => this.toDomain(entity));
  }

  async findRecentBySession(
    sessionId: string,
    tenantId: string,
    limit: number,
  ): Promise<ChatbotMessage[]> {
    const entities = await this.repo.find({
      where: { sessionId, tenantId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    // DESC + LIMIT fetches the most recent `limit` rows only. reverse() is a separate statement,
    // not chained mid-expression, since it mutates in place (toReversed() needs ES2023, past this
    // project's configured lib target) — restores the oldest-first order every caller of this
    // port expects (matches findBySession's ordering).
    entities.reverse();
    return entities.map((entity) => this.toDomain(entity));
  }

  // SUM(cost_usd) has no plain repository.sum() shorthand in TypeORM — the QueryBuilder's own
  // SELECT/getRawOne() is the idiomatic way to express one aggregate, not a raw-SQL escape hatch
  // (contrast with shared/infrastructure/outbox's ON CONFLICT/FOR UPDATE SKIP LOCKED cases, which
  // genuinely can't be expressed through the query builder).
  async sumCostUsdSince(since: Date): Promise<Decimal> {
    const row = await this.repo
      .createQueryBuilder('message')
      .select('COALESCE(SUM(message.costUsd), 0)', 'total')
      .where('message.createdAt >= :since', { since })
      .getRawOne<{ total: string }>();
    return new Decimal(row?.total ?? 0);
  }

  async save(message: ChatbotMessage): Promise<void> {
    const entity = this.toEntity(message);
    const manager = getActiveEntityManager();
    if (manager) {
      await manager.save(ChatbotMessageEntity, entity);
    } else {
      await this.repo.save(entity);
    }
  }

  async deleteOlderThan(cutoff: Date): Promise<number> {
    const manager = getActiveEntityManager();
    const result = await (manager ?? this.repo.manager)
      .createQueryBuilder()
      .delete()
      .from(ChatbotMessageEntity)
      .where('created_at < :cutoff', { cutoff })
      .execute();
    return result.affected ?? 0;
  }

  private toDomain(entity: ChatbotMessageEntity): ChatbotMessage {
    return ChatbotMessage.reconstitute({
      id: entity.id,
      sessionId: entity.sessionId,
      tenantId: entity.tenantId,
      role: entity.role as ChatbotMessageRole,
      content: entity.content,
      inputTokens: entity.inputTokens,
      outputTokens: entity.outputTokens,
      modelId: entity.modelId,
      costUsd: new Decimal(entity.costUsd),
      createdAt: toDate(entity.createdAt),
    });
  }

  private toEntity(message: ChatbotMessage): ChatbotMessageEntity {
    const entity = new ChatbotMessageEntity();
    entity.id = message.id;
    entity.sessionId = message.sessionId;
    entity.tenantId = message.tenantId;
    entity.role = message.role;
    entity.content = message.content;
    entity.inputTokens = message.inputTokens;
    entity.outputTokens = message.outputTokens;
    entity.modelId = message.modelId;
    entity.costUsd = message.costUsd.toFixed(8);
    entity.createdAt = message.createdAt;
    return entity;
  }
}
