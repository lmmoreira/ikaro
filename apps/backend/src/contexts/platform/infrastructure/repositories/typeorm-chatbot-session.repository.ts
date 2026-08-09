import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { toDate } from '../../../../shared/utils/date';
import { IChatbotSessionRepository } from '../../application/ports/chatbot-session-repository.port';
import { ChatbotSession, ChatbotSessionStatus } from '../../domain/chatbot-session.aggregate';
import { ChatbotSessionEntity } from '../entities/chatbot-session.entity';

@Injectable()
export class TypeOrmChatbotSessionRepository implements IChatbotSessionRepository {
  constructor(
    @InjectRepository(ChatbotSessionEntity)
    private readonly repo: Repository<ChatbotSessionEntity>,
  ) {}

  async findById(id: string, tenantId: string): Promise<ChatbotSession | null> {
    const entity = await this.repo.findOne({ where: { id, tenantId } });
    return entity ? this.toDomain(entity) : null;
  }

  async save(session: ChatbotSession): Promise<void> {
    const entity = this.toEntity(session);
    const manager = getActiveEntityManager();
    if (manager) {
      await manager.save(ChatbotSessionEntity, entity);
    } else {
      await this.repo.save(entity);
    }
  }

  private toDomain(entity: ChatbotSessionEntity): ChatbotSession {
    return ChatbotSession.reconstitute({
      id: entity.id,
      tenantId: entity.tenantId,
      clientIp: entity.clientIp,
      startedAt: toDate(entity.startedAt),
      lastMessageAt: toDate(entity.lastMessageAt),
      conversationDate: entity.conversationDate,
      messageCount: entity.messageCount,
      status: entity.status as ChatbotSessionStatus,
    });
  }

  private toEntity(session: ChatbotSession): ChatbotSessionEntity {
    const entity = new ChatbotSessionEntity();
    entity.id = session.id;
    entity.tenantId = session.tenantId;
    entity.clientIp = session.clientIp;
    entity.startedAt = session.startedAt;
    entity.lastMessageAt = session.lastMessageAt;
    entity.conversationDate = session.conversationDate;
    entity.messageCount = session.messageCount;
    entity.status = session.status;
    return entity;
  }
}
