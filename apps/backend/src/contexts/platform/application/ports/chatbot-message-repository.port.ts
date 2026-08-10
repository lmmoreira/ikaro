import { ChatbotMessage } from '../../domain/chatbot-message.aggregate';

export const CHATBOT_MESSAGE_REPOSITORY = Symbol('IChatbotMessageRepository');

export interface IChatbotMessageRepository {
  findById(id: string, tenantId: string): Promise<ChatbotMessage | null>;
  save(message: ChatbotMessage): Promise<void>;
}
