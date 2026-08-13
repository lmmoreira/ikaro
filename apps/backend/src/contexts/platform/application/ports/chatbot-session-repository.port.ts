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
   * UC-035 retention purge: deletes every session row where `started_at < cutoff` AND
   * `last_message_at < cutoff` AND it now has zero remaining `chatbot_messages` rows — never a
   * session that still has messages (message_count is never decremented when a session's old
   * messages are purged, so it can't be trusted to answer "zero remaining messages" on its
   * own; this checks the live table instead). A single set-based statement, not a
   * candidate-list-then-per-row loop — the adapter must express the eligibility check and the
   * delete as one atomic, correlated operation (see
   * TypeOrmChatbotSessionRepository.deleteOrphanedStartedBefore()), both to avoid an unbounded
   * N+1 scan and to close the cross-transaction race window against a concurrent
   * SendChatMessageUseCase call reusing this same session (PR #365 review findings). The
   * `last_message_at` condition narrows that race further: a session that received a message
   * even moments ago is never a delete candidate, regardless of how old `started_at` is.
   */
  deleteOrphanedStartedBefore(cutoff: Date): Promise<number>;
}
