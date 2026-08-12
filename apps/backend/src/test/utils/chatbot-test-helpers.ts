import { utcDateToLocalDate } from '../../shared/utils/calendar-date';
import { ChatbotSession } from '../../contexts/platform/domain/chatbot-session.aggregate';

export function todayInSaoPaulo(): string {
  return utcDateToLocalDate(new Date(), 'America/Sao_Paulo');
}

/** Reconstitutes `session` with last_message_at outside the 2-minute concurrency live-ness
 * window, so it no longer counts toward the concurrency cap. */
export function staleSession(session: ChatbotSession, tenantId: string): ChatbotSession {
  return ChatbotSession.reconstitute({
    id: session.id,
    tenantId,
    clientIp: session.clientIp,
    startedAt: session.startedAt,
    lastMessageAt: new Date(Date.now() - 5 * 60 * 1000),
    conversationDate: session.conversationDate,
    messageCount: session.messageCount,
    status: 'ACTIVE',
  });
}
