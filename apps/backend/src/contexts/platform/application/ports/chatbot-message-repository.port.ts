import { Decimal } from 'decimal.js';
import { ChatbotMessage } from '../../domain/chatbot-message.aggregate';

export const CHATBOT_MESSAGE_REPOSITORY = Symbol('IChatbotMessageRepository');

export interface IChatbotMessageRepository {
  findById(id: string, tenantId: string): Promise<ChatbotMessage | null>;
  save(message: ChatbotMessage): Promise<void>;
  /** All messages for one session, oldest first. General-purpose read (tests, future admin
   * views) — SendChatMessageUseCase itself uses findRecentBySession() for its own hot path
   * (cap layer 8's history-window truncation), not this, to avoid loading the full
   * conversation on every turn (PR #360 review finding). */
  findBySession(sessionId: string, tenantId: string): Promise<ChatbotMessage[]>;
  /**
   * Cap layer 8's history window: only the last `limit` messages for one session, oldest
   * first — a SQL-level LIMIT, not "fetch everything and slice in JS" (findBySession's
   * shape), so per-call DB/CPU cost stays flat regardless of how long the conversation runs.
   */
  findRecentBySession(
    sessionId: string,
    tenantId: string,
    limit: number,
  ): Promise<ChatbotMessage[]>;
  /**
   * Cap layer 9 (platform-wide, not tenant-scoped): SUM(cost_usd) across every tenant's
   * messages created at/after `since`, for the global daily spend circuit breaker.
   */
  sumCostUsdSince(since: Date): Promise<Decimal>;
}
