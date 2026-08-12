import { ChatbotSession } from '../../domain/chatbot-session.aggregate';

export const CHATBOT_SESSION_REPOSITORY = Symbol('IChatbotSessionRepository');

export interface IChatbotSessionRepository {
  findById(id: string, tenantId: string): Promise<ChatbotSession | null>;
  save(session: ChatbotSession): Promise<void>;
  /** Cap layer 1 (docs/discovery/CHATBOT/CHATBOT.md §8): tenant-wide daily conversation count. */
  countByTenantAndDate(tenantId: string, conversationDate: string): Promise<number>;
  /** Cap layer 2: per-visitor daily conversation count, same table + an added client_ip filter. */
  countByTenantIpAndDate(
    tenantId: string,
    clientIp: string,
    conversationDate: string,
  ): Promise<number>;
  /** Cap layer 3: ACTIVE sessions whose last_message_at is after `since` (live-ness proxy). */
  countActiveSince(tenantId: string, since: Date): Promise<number>;
}
