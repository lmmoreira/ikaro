import { ChatbotSession } from '../../../contexts/platform/domain/chatbot-session.aggregate';

const DEFAULT_TENANT_ID = '01234567-0000-7000-8000-000000000001';
const DEFAULT_CLIENT_IP = '203.0.113.10';
const DEFAULT_CONVERSATION_DATE = '2026-01-01';

export class ChatbotSessionBuilder {
  private tenantId = DEFAULT_TENANT_ID;
  private clientIp = DEFAULT_CLIENT_IP;
  private conversationDate = DEFAULT_CONVERSATION_DATE;

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

  build(): ChatbotSession {
    const session = ChatbotSession.create({
      tenantId: this.tenantId,
      clientIp: this.clientIp,
      conversationDate: this.conversationDate,
    });
    session.clearDomainEvents();
    return session;
  }
}
