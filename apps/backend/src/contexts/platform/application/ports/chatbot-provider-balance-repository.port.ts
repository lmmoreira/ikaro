import { ChatbotProviderBalance } from '../../domain/chatbot-provider-balance.aggregate';

export const CHATBOT_PROVIDER_BALANCE_REPOSITORY = Symbol('IChatbotProviderBalanceRepository');

export interface IChatbotProviderBalanceRepository {
  findByProvider(provider: string): Promise<ChatbotProviderBalance | null>;
  save(balance: ChatbotProviderBalance): Promise<void>;
}
