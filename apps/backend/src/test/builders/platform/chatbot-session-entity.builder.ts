import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { ChatbotSessionEntity } from '../../../contexts/platform/infrastructure/entities/chatbot-session.entity';

export class ChatbotSessionEntityBuilder {
  private id = uuidv7();
  private tenantId = 'tenant-id-1';
  private clientIp = '203.0.113.10';
  private readonly startedAt = new Date('2026-01-01T00:00:00Z');
  private lastMessageAt = new Date('2026-01-01T00:00:00Z');
  private conversationDate = '2026-01-01';
  private messageCount = 0;
  private status = 'ACTIVE';

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withClientIp(clientIp: string): this {
    this.clientIp = clientIp;
    return this;
  }

  withLastMessageAt(lastMessageAt: Date): this {
    this.lastMessageAt = lastMessageAt;
    return this;
  }

  withConversationDate(conversationDate: string): this {
    this.conversationDate = conversationDate;
    return this;
  }

  withMessageCount(messageCount: number): this {
    this.messageCount = messageCount;
    return this;
  }

  withStatus(status: string): this {
    this.status = status;
    return this;
  }

  build(): ChatbotSessionEntity {
    const e = new ChatbotSessionEntity();
    e.id = this.id;
    e.tenantId = this.tenantId;
    e.clientIp = this.clientIp;
    e.startedAt = this.startedAt;
    e.lastMessageAt = this.lastMessageAt;
    e.conversationDate = this.conversationDate;
    e.messageCount = this.messageCount;
    e.status = this.status;
    return e;
  }
}
