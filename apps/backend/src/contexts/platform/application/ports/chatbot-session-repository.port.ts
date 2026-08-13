import { ChatbotSession } from '../../domain/chatbot-session.aggregate';

export const CHATBOT_SESSION_REPOSITORY = Symbol('IChatbotSessionRepository');

export interface IChatbotSessionRepository {
  findById(id: string, tenantId: string): Promise<ChatbotSession | null>;
  save(session: ChatbotSession): Promise<void>;
  /** Removes a session row entirely — only safe for a brand-new session whose provider call
   * failed before any chatbot_messages rows were ever written for it, so a failed first attempt
   * never silently burns the tenant's daily/per-IP/concurrency cap budget for a conversation
   * that never happened. Never called for an existing session (which has real prior messages). */
  deleteById(id: string, tenantId: string): Promise<void>;
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
  /**
   * UC-035 retention purge: sessions where `started_at < cutoff`, across all tenants — candidates
   * for deletion, not a deletion itself. The job re-checks each candidate against the live
   * chatbot_messages table (via IChatbotMessageRepository.findBySession()) before deleting with
   * the existing deleteById() above, since message_count is never decremented when a session's
   * old messages are purged and so can't be trusted to answer "zero remaining messages" on its
   * own — see ChatbotRetentionPurgeJob.
   */
  findStartedBefore(cutoff: Date): Promise<ChatbotSession[]>;
}
