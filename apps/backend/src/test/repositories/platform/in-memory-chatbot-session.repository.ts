import { IChatbotSessionRepository } from '../../../contexts/platform/application/ports/chatbot-session-repository.port';
import { ChatbotSession } from '../../../contexts/platform/domain/chatbot-session.aggregate';

export class InMemoryChatbotSessionRepository implements IChatbotSessionRepository {
  private readonly store = new Map<string, ChatbotSession>();

  async findById(id: string, tenantId: string): Promise<ChatbotSession | null> {
    const session = this.store.get(id);
    return session && session.tenantId === tenantId ? session : null;
  }

  async save(session: ChatbotSession): Promise<void> {
    this.store.set(session.id, session);
  }

  async deleteById(id: string, tenantId: string): Promise<void> {
    const session = this.store.get(id);
    if (session && session.tenantId === tenantId) this.store.delete(id);
  }

  async countByTenantAndDate(tenantId: string, conversationDate: string): Promise<number> {
    return [...this.store.values()].filter(
      (s) => s.tenantId === tenantId && s.conversationDate === conversationDate,
    ).length;
  }

  async countByTenantIpAndDate(
    tenantId: string,
    clientIp: string,
    conversationDate: string,
  ): Promise<number> {
    return [...this.store.values()].filter(
      (s) =>
        s.tenantId === tenantId &&
        s.clientIp === clientIp &&
        s.conversationDate === conversationDate,
    ).length;
  }

  async countActiveSince(tenantId: string, since: Date): Promise<number> {
    return [...this.store.values()].filter(
      (s) => s.tenantId === tenantId && s.status === 'ACTIVE' && s.lastMessageAt > since,
    ).length;
  }

  async findStartedBefore(cutoff: Date): Promise<ChatbotSession[]> {
    return [...this.store.values()].filter((s) => s.startedAt < cutoff);
  }
}
