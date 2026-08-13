import { IChatbotSessionRepository } from '../../../contexts/platform/application/ports/chatbot-session-repository.port';
import { ChatbotSession } from '../../../contexts/platform/domain/chatbot-session.aggregate';
import { InMemoryChatbotMessageRepository } from './in-memory-chatbot-message.repository';

export class InMemoryChatbotSessionRepository implements IChatbotSessionRepository {
  private readonly store = new Map<string, ChatbotSession>();

  // Optional — only ChatbotRetentionPurgeJob's own tests need cross-referencing the message
  // store (real production correlation lives entirely server-side in a single SQL statement,
  // see TypeOrmChatbotSessionRepository.deleteOrphanedStartedBefore()). Every other caller of
  // this double doesn't touch deleteOrphanedStartedBefore() and is unaffected by omitting it.
  constructor(private readonly messageRepo?: InMemoryChatbotMessageRepository) {}

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

  async deleteOrphanedStartedBefore(cutoff: Date): Promise<number> {
    const candidates = [...this.store.values()].filter(
      (s) => s.startedAt < cutoff && s.lastMessageAt < cutoff,
    );
    let deleted = 0;
    for (const session of candidates) {
      // No messageRepo wired — fail safe (never confirm orphan status) rather than risk
      // silently over-deleting in a test that didn't intend to exercise this path.
      const stillHasMessages = this.messageRepo
        ? await this.messageRepo.existsForSession(session.id, session.tenantId)
        : true;
      if (!stillHasMessages) {
        this.store.delete(session.id);
        deleted++;
      }
    }
    return deleted;
  }
}
