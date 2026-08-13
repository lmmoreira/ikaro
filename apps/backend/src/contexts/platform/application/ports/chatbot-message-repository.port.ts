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
  /**
   * UC-035 retention purge: deletes every message row where `created_at < cutoff`, across all
   * tenants in one pass. Returns the number of rows deleted.
   */
  deleteOlderThan(cutoff: Date): Promise<number>;
  /**
   * UC-035 retention purge: whether any message row still exists for this session — the
   * existence check ChatbotRetentionPurgeJob uses (not findBySession(), which loads full rows)
   * to decide whether a session past the retention window is now orphaned. Unlike this
   * repository's other read methods, the TypeORM adapter must be transaction-aware here: the
   * job calls this inside the same transaction as deleteOlderThan() and needs to see that
   * call's own not-yet-committed deletions — a plain repository read on a separate connection
   * would still see the pre-delete state until commit.
   */
  existsForSession(sessionId: string, tenantId: string): Promise<boolean>;
}
