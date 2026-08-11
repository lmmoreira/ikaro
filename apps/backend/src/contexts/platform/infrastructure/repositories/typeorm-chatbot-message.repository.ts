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

  async save(message: ChatbotMessage): Promise<void> {
    const entity = this.toEntity(message);
    const manager = getActiveEntityManager();
    if (manager) {
      await manager.save(ChatbotMessageEntity, entity);
    } else {
      await this.repo.save(entity);
    }
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
