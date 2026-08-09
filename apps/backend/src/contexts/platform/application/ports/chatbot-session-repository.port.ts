import { ChatbotSession } from '../../domain/chatbot-session.aggregate';

export const CHATBOT_SESSION_REPOSITORY = Symbol('IChatbotSessionRepository');

export interface IChatbotSessionRepository {
  findById(id: string, tenantId: string): Promise<ChatbotSession | null>;
  save(session: ChatbotSession): Promise<void>;
}
