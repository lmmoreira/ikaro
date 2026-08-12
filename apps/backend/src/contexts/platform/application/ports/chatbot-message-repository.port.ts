import { Decimal } from 'decimal.js';
import { ChatbotMessage } from '../../domain/chatbot-message.aggregate';

export const CHATBOT_MESSAGE_REPOSITORY = Symbol('IChatbotMessageRepository');

export interface IChatbotMessageRepository {
  findById(id: string, tenantId: string): Promise<ChatbotMessage | null>;
  save(message: ChatbotMessage): Promise<void>;
  /**
   * All messages for one session, oldest first. Serves two callers in
   * SendChatMessageUseCase from a single query: cap layer 4 (`.length` against
   * maxMessagesPerConversation) and cap layer 8's history-window truncation
   * (`.slice(-maxHistoryMessagesSentToLlm)`) — docs/discovery/CHATBOT/CHATBOT.md §8.
   */
  findBySession(sessionId: string, tenantId: string): Promise<ChatbotMessage[]>;
  /**
   * Cap layer 9 (platform-wide, not tenant-scoped): SUM(cost_usd) across every tenant's
   * messages created at/after `since`, for the global daily spend circuit breaker.
   */
  sumCostUsdSince(since: Date): Promise<Decimal>;
}
