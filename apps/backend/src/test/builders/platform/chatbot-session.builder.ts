import { ChatbotSession } from '../../../contexts/platform/domain/chatbot-session.aggregate';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

const DEFAULT_TENANT_ID = '01234567-0000-7000-8000-000000000001';
const DEFAULT_CLIENT_IP = '203.0.113.10';
const DEFAULT_CONVERSATION_DATE = '2026-01-01';

export class ChatbotSessionBuilder {
  private id = uuidv7();
  private tenantId = DEFAULT_TENANT_ID;
  private clientIp = DEFAULT_CLIENT_IP;
  private conversationDate = DEFAULT_CONVERSATION_DATE;
  private startedAt = new Date();
  private readonly messageCount = 0;
  private readonly status: 'ACTIVE' | 'CLOSED' | 'CAPPED' = 'ACTIVE';

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

  withConversationDate(conversationDate: string): this {
    this.conversationDate = conversationDate;
    return this;
  }

  withStartedAt(startedAt: Date): this {
    this.startedAt = startedAt;
    return this;
  }

  build(): ChatbotSession {
    return ChatbotSession.reconstitute({
      id: this.id,
      tenantId: this.tenantId,
      clientIp: this.clientIp,
      startedAt: this.startedAt,
      lastMessageAt: this.startedAt,
      conversationDate: this.conversationDate,
      messageCount: this.messageCount,
      status: this.status,
    });
  }
}
