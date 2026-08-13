import { Decimal } from 'decimal.js';
import { IChatbotMessageRepository } from '../../../contexts/platform/application/ports/chatbot-message-repository.port';
import { ChatbotMessage } from '../../../contexts/platform/domain/chatbot-message.aggregate';

export class InMemoryChatbotMessageRepository implements IChatbotMessageRepository {
  private readonly store = new Map<string, ChatbotMessage>();

  async findById(id: string, tenantId: string): Promise<ChatbotMessage | null> {
    const message = this.store.get(id);
    return message && message.tenantId === tenantId ? message : null;
  }

  async findBySession(sessionId: string, tenantId: string): Promise<ChatbotMessage[]> {
    return [...this.store.values()]
      .filter((m) => m.sessionId === sessionId && m.tenantId === tenantId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async findRecentBySession(
    sessionId: string,
    tenantId: string,
    limit: number,
  ): Promise<ChatbotMessage[]> {
    if (limit <= 0) return [];
    const all = await this.findBySession(sessionId, tenantId);
    return all.slice(-limit);
  }

  async sumCostUsdSince(since: Date): Promise<Decimal> {
    return [...this.store.values()]
      .filter((m) => m.createdAt >= since)
      .reduce((sum, m) => sum.plus(m.costUsd), new Decimal(0));
  }

  async save(message: ChatbotMessage): Promise<void> {
    this.store.set(message.id, message);
  }

  async deleteOlderThan(cutoff: Date): Promise<number> {
    const toDelete = [...this.store.values()].filter((m) => m.createdAt < cutoff);
    for (const message of toDelete) this.store.delete(message.id);
    return toDelete.length;
  }

  async existsForSession(sessionId: string, tenantId: string): Promise<boolean> {
    return [...this.store.values()].some(
      (m) => m.sessionId === sessionId && m.tenantId === tenantId,
    );
  }
}
